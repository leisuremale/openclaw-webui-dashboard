"""Parse skill metadata from README tables and SKILL.md frontmatter."""
import logging
import os
import re

import yaml

logger = logging.getLogger(__name__)


def _parse_skills_readme(readme_path: str) -> dict[str, dict]:
    """Parse a skills/README.md markdown table to extract {skill_name: {description, keywords}}."""
    result: dict[str, dict] = {}
    try:
        with open(readme_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return result

    lines = content.split("\n")

    # --- Pass 1: standard markdown tables ---
    in_attachment_section = False  # Skip "已接入触发规则" / "挂载" sections
    for line in lines:
        line = line.strip()
        # Detect section headers
        if line.startswith("##") or line.startswith("###"):
            section_lower = line.lstrip("#").strip().lower()
            if any(kw in section_lower for kw in ("已接入", "挂载", "触发规则", "接入触发")):
                in_attachment_section = True
            else:
                in_attachment_section = False
            continue
        if in_attachment_section:
            continue
        if not line.startswith("|") or not line.endswith("|"):
            continue
        # Skip header/separator rows
        if "---" in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue
        # First cell should contain skill name in backticks or bold markers
        name_match = re.search(r'`([^`/]+)`', cells[0])
        if not name_match:
            # Try bold markers: **skill-name** or __skill-name__
            name_match = re.search(r'\*\*([^*]+)\*\*', cells[0])
        if not name_match:
            # Try plain text skill name (for tables without formatting)
            name_match = re.search(r'([a-zA-Z0-9][a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*)', cells[0])
        if not name_match:
            continue
        skill_name = name_match.group(1)
        # Skip header-row names like "Skill", "技能", "子技能"
        if skill_name.lower() in ("skill", "skills", "技能", "子技能", "子 skill"):
            continue
        # Clean skill name (remove trailing /)
        skill_name = skill_name.rstrip("/")

        # Handle table formats by column count:
        #   2-col: | Skill | 说明 |   OR   | 子技能 | 触发关键词 |
        #   3-col: | Skill | 说明 | 触发关键词 |
        #   4-col Nuwa: | Skill | 人物 | 擅长领域 | 触发关键词 |
        #   4-col xiao-le: | 技能 | 类型 | 主要功能 | 触发方式 |
        if len(cells) >= 4:
            # For 4+ columns, use the last two meaningful columns as desc & keywords
            description = cells[-2] if len(cells) >= 3 else cells[1]
            keywords = cells[-1]
        elif len(cells) == 3:
            description = cells[1]
            keywords = cells[2]
        elif len(cells) == 2:
            # 2-column table: check if col 2 looks like trigger keywords
            col2 = cells[1]
            has_backtick_keywords = bool(re.search(r'`[^`]+`', col2))
            if has_backtick_keywords:
                # Looks like: | 子技能 | `触发词1`、`触发词2` |
                description = ""
                keywords = col2
            else:
                description = col2
                keywords = ""

        # Clean description: remove HTML, markdown links
        description_clean = re.sub(r'<[^>]+>', '', description)
        description_clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', description_clean)
        # Clean keywords: split by "" or "" then join with ，
        keywords_clean = re.sub(r'[""]["”]', '，', keywords)
        keywords_clean = re.sub(r'["""]', '', keywords_clean)

        result[skill_name] = {
            "description": description_clean.strip(),
            "keywords": keywords_clean.strip(),
        }

    # --- Pass 2: ad-hoc format (## skill_name sections with **触发词**： blocks) ---
    # Only run if we didn't get enough table-parsed results
    if not result:
        current_skill = None
        current_desc_parts = []
        current_keywords = ""
        in_keywords_block = False
        for line in lines:
            line_stripped = line.strip()
            # Detect skill section: ## skill-name
            section_match = re.match(r'^##\s+([a-zA-Z0-9_-]+)', line_stripped)
            if section_match:
                if current_skill:
                    result[current_skill] = {
                        "description": " ".join(current_desc_parts).strip()[:200],
                        "keywords": current_keywords.strip(),
                    }
                current_skill = section_match.group(1)
                current_desc_parts = []
                current_keywords = ""
                in_keywords_block = False
                continue

            if current_skill:
                # Detect 触发词 section start
                kw_header = re.match(r'\*\*触发词?\*\*[：:]?\s*(.*)', line_stripped)
                if kw_header:
                    in_keywords_block = True
                    if kw_header.group(1):
                        current_keywords = kw_header.group(1).strip()
                    continue

                # Collect keywords from bullet lines in keywords block
                if in_keywords_block:
                    bullet_match = re.match(r'^-\s*[`]?(.+?)[`]?\s*(?:/.*)?$', line_stripped)
                    if bullet_match:
                        kw = bullet_match.group(1).strip().strip('`')
                        if kw:
                            current_keywords += ("，" if current_keywords else "") + kw
                        continue
                    # Empty line or next section ends keywords block
                    if not line_stripped:
                        continue
                    in_keywords_block = False

                # Collect description text (extract **用途**： etc.)
                if line_stripped and not line_stripped.startswith("|") and not line_stripped.startswith("#") and not line_stripped.startswith("-"):
                    # Strip bold labels like **用途**： or **原则**：
                    desc_clean = re.sub(r'\*\*[^*]+\*\*[：:]\s*', '', line_stripped)
                    if desc_clean:
                        current_desc_parts.append(desc_clean)

        if current_skill and current_skill not in result:
            result[current_skill] = {
                "description": " ".join(current_desc_parts).strip()[:200],
                "keywords": current_keywords.strip(),
            }

    return result


def _parse_yaml_frontmatter(content: str) -> dict[str, str]:
    """Extract YAML frontmatter from markdown via pyyaml.

    Handles proper --- ... --- frontmatter and the "broken" variant where the
    closing --- is missing (found in some global skills).
    """
    m = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not m:
        # Broken frontmatter: --- at start, no closer. Greedily collect
        # leading "key: ..." lines.
        m = re.match(r'^---\s*\n((?:[\w][\w_-]*\s*:.*\n)+)', content)
    if not m:
        return {}

    try:
        data = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        logger.warning("YAML frontmatter parse failed: %s", e)
        return {}

    if not isinstance(data, dict):
        return {}

    result: dict[str, str] = {}
    for k, v in data.items():
        if v is None:
            result[str(k).lower()] = ""
        elif isinstance(v, str):
            result[str(k).lower()] = v.strip()
        else:
            result[str(k).lower()] = str(v)
    return result


def _extract_skill_info(
    name: str, source: str, entry_path: str, readme_table: dict[str, dict]
) -> dict:
    """Extract skill info from SKILL.md and the parent README table."""
    description = ""
    keywords = ""

    # First try SKILL.md - parse YAML frontmatter for description
    skill_md = os.path.join(entry_path, "SKILL.md")
    if os.path.exists(skill_md):
        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                full_content = f.read()
        except Exception:
            full_content = ""

        # Parse YAML frontmatter
        frontmatter = _parse_yaml_frontmatter(full_content)
        if frontmatter.get("description"):
            description = frontmatter["description"]
            # Truncate for display
            if len(description) > 200:
                description = description[:200] + "…"

        # Fallback: first non-header, non-frontmatter, non-metadata line
        if not description:
            for line in full_content.split("\n"):
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or stripped.startswith("---"):
                    continue
                # Skip common YAML metadata keys
                if re.match(r'^(name|metadata|emoji|requires|install|version)\s*:', stripped):
                    continue
                # If line starts with "description:", extract the value
                desc_match = re.match(r'^description\s*:\s*(.+)', stripped)
                if desc_match:
                    description = desc_match.group(1).strip().strip('"').strip("'")[:200]
                    break
                description = stripped[:200]
                break

    # Then try the README table for richer info
    # Priority: SKILL.md frontmatter > README table (only fallback when SKILL.md has no description)
    table_info = readme_table.get(name, {})
    if not description and table_info.get("description") and table_info["description"] != "—":
        description = table_info["description"]
    keywords = table_info.get("keywords", "")

    # Get last updated time from directory mtime
    last_updated_ms = 0
    try:
        last_updated_ms = int(os.path.getmtime(entry_path) * 1000)
    except Exception:
        pass

    return {
        "name": name,
        "source": source,
        "path": entry_path,
        "description": description,
        "keywords": keywords,
        "lastUpdatedMs": last_updated_ms,
    }
