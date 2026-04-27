"""Build a queryable JSON database from the five reptime.help pages."""
import json
import os
import re
import urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup

HTML_DIR = Path(__file__).parent / "reptime_html"
DST = Path(__file__).parent / "reptime-help.json"


# ---------- helpers ----------

def soup_for(name):
    return BeautifulSoup((HTML_DIR / f"{name}.html").read_text(), "html.parser")


def text(el):
    return el.get_text(" ", strip=True) if el else None


def link(el):
    a = el.find("a") if el else None
    return a["href"] if a and a.has_attr("href") else None


# ---------- TD list ----------

def parse_td_list():
    """Parse the trusted dealer table on the homepage."""
    soup = soup_for("td-list")
    table = soup.find("table")
    rows = table.find_all("tr")
    headers = [text(c) for c in rows[0].find_all(["th", "td"])]
    dealers = []
    for r in rows[1:]:
        cells = r.find_all("td")
        if len(cells) < 6:
            continue
        name = text(cells[0])
        website_text = text(cells[1])
        website_url = link(cells[1])
        whatsapp_text = text(cells[2])
        whatsapp_url = link(cells[2])
        email_text = text(cells[3])
        forum = text(cells[4])
        notes = text(cells[5])
        # The dash "—" indicates "not provided" — normalize to null.
        dealers.append({
            "name": name,
            "website": website_text if website_text != "—" else None,
            "website_url": website_url,
            "whatsapp": whatsapp_text if whatsapp_text != "—" else None,
            "whatsapp_url": whatsapp_url,
            "email": email_text if email_text != "—" else None,
            "forum": forum if forum != "—" else None,
            "notes": notes or None,
        })
    return {"columns": headers, "dealers": dealers}


# ---------- Who Makes the Best (data is a JS array) ----------

# Each row: {b:"Rolex",f:"Submariner",r:"126610LN/LV/LB",m:"3235 Clone",
#            f1:"VSF",f2:"ARF",f3:"ZF",t:"nwbig",n:""}
# Keys: b=brand, f=family, r=reference/model number, m=movement,
#       f1/f2/f3=ranked factories, t=tier (nwbig | super | ""), n=notes
JS_KEY_RE = re.compile(r'(?<=[{,])\s*([a-zA-Z][a-zA-Z0-9]*)\s*:')
TIER_LABEL = {
    "nwbig": "NWBIG",
    "super": "Super Rep",
}


def parse_who_makes_the_best():
    soup = soup_for("who-makes-the-best")
    # The data lives in the second <script> tag as `var D=[ ... ];`.
    js = None
    for s in soup.find_all("script"):
        c = s.string or s.get_text()
        if c and "var D=[" in c:
            js = c
            break
    if not js:
        return []
    m = re.search(r"var\s+D\s*=\s*(\[.*?\]);", js, re.DOTALL)
    if not m:
        return []
    raw = m.group(1)
    # Convert JS-style object literals (unquoted keys) to JSON.
    json_text = JS_KEY_RE.sub(r'"\1":', raw)
    rows = json.loads(json_text)

    out = []
    for d in rows:
        recs = []
        for idx, k in enumerate(("f1", "f2", "f3"), start=1):
            v = d.get(k, "")
            if v:
                recs.append({"rank": idx, "factory": v})
        tier_code = d.get("t", "")
        out.append({
            "brand": d.get("b") or None,
            "model_family": d.get("f") or None,
            "reference": d.get("r") or None,
            "movement": d.get("m") or None,
            "recommendations": recs,
            "tier": TIER_LABEL.get(tier_code),
            "notes": d.get("n") or None,
        })
    return out


# ---------- Glossary ----------

def parse_glossary():
    soup = soup_for("glossary")
    art = soup.find("article")
    rt = art.find("div", class_="rt")
    sections = []
    for card in rt.find_all("div", class_="rt-card"):
        category_el = card.find("div", class_="rt-cl")
        category = text(category_el)
        terms = []
        for tm in card.find_all("div", class_="rt-tm"):
            term = text(tm.find("div", class_="rt-tw"))
            definition = text(tm.find("div", class_="rt-td"))
            tags = [text(s) for s in tm.find_all("span", class_="nt")]
            entry = {"term": term, "definition": definition}
            if tags:
                entry["tags"] = tags
            terms.append(entry)
        sections.append({"category": category, "terms": terms})
    return sections


# ---------- Newbie guide ----------

CALLOUT_KIND = {
    "rt-cb-d": "danger",
    "rt-cb-w": "warning",
    "rt-cb-i": "info",
    "rt-cb-s": "success",
}


def parse_callout(div):
    classes = div.get("class", [])
    kind = next((CALLOUT_KIND[c] for c in classes if c in CALLOUT_KIND), None)
    strong = div.find("strong")
    title = text(strong) if strong else None
    body = text(div)
    if title and body and body.startswith(title):
        body = body[len(title):].strip(" .—–-:")
    return {"kind": kind, "title": title, "body": body or None}


def parse_chat(div):
    return [text(line) for line in div.find_all("div", recursive=False) if text(line)]


def parse_newbie_guide():
    soup = soup_for("newbie-guide")
    art = soup.find("article")
    rt = art.find("div", class_="rt")

    title = text(rt.find("h2"))
    hero = rt.find("div", class_="rt-hero")
    summary = text(hero.find("p")) if hero else None

    steps = []
    for card in rt.find_all("div", class_="rt-card", recursive=False):
        step_number_text = text(card.find("div", class_="rt-sn"))
        h3 = card.find("h3")
        step_title = text(h3)

        paragraphs = []
        callouts = []
        bullets = []
        chats = []
        sub_options = []
        current_option = None

        for child in card.children:
            if not getattr(child, "name", None):
                continue
            cls = child.get("class", [])
            if child.name in ("div",) and "rt-sn" in cls:
                continue
            if child.name == "h3":
                continue
            if child.name == "div" and "rt-sub" in cls:
                if current_option:
                    sub_options.append(current_option)
                current_option = {"title": text(child), "content": []}
                continue
            if child.name == "p":
                t = text(child)
                if t:
                    if current_option is not None:
                        current_option["content"].append(t)
                    else:
                        paragraphs.append(t)
                continue
            if child.name == "ul" and "rt-tips" in cls:
                items = [text(li) for li in child.find_all("li")]
                if current_option is not None:
                    current_option["content"].extend(items)
                else:
                    bullets.extend(items)
                continue
            if child.name == "div" and "rt-cb" in cls:
                callouts.append(parse_callout(child))
                continue
            if child.name == "div" and "rt-chat" in cls:
                chats.append(parse_chat(child))
                continue
            if child.name == "div" and "rt-mg" in cls:
                # Payment-method grid: each .rt-mc is a method.
                methods = []
                for mc in child.find_all("div", class_="rt-mc"):
                    h = mc.find(["strong", "h4"])
                    name = text(h) if h else None
                    full = text(mc)
                    desc = full
                    if name and full.startswith(name):
                        desc = full[len(name):].strip(" .—–-:")
                    methods.append({"name": name, "description": desc})
                bullets.append({"payment_methods": methods})

        if current_option:
            sub_options.append(current_option)

        steps.append({
            "step": step_number_text,
            "title": step_title,
            "paragraphs": paragraphs,
            "options": sub_options,
            "tips": [b for b in bullets if isinstance(b, str)],
            "payment_methods": next((b["payment_methods"] for b in bullets if isinstance(b, dict)), None),
            "chat_examples": chats or None,
            "callouts": callouts,
        })

    return {"title": title, "summary": summary, "steps": steps}


# ---------- Factories ----------

def split_first_word(s):
    """Split 'Foo Bar baz' into ('Foo', 'Bar baz') for cases where the first
    visual token is a label and the rest is a description."""
    if not s:
        return None, None
    parts = s.split(None, 1)
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]


def parse_factories():
    soup = soup_for("factories")
    art = soup.find("article")
    rt = art.find("div", class_="rt")

    hero = rt.find("div", class_="rt-hero")
    title = text(hero.find("h2")) if hero else text(rt.find("h2"))
    intro = text(hero.find("p")) if hero else None

    quality_tiers = []
    major_factories = []
    community_guides = []
    gold_subsections = []
    movements_items = []
    callouts = []

    for card in rt.find_all("div", class_="rt-card", recursive=False):
        h3_title = text(card.find("h3"))

        # Quality tiers card
        for tier in card.find_all("div", class_="rt-tier"):
            head = tier.find("div", class_="rt-tier-hd")
            head_text = text(head)
            # Header reads e.g. "HIGH TIER Top factory replicas"
            tier_label, tier_name = split_first_word(head_text or "")
            if tier_label and tier_name and tier_name.lower().startswith("tier"):
                # "HIGH TIER ..." → label = "HIGH TIER"
                rest = head_text.split(None, 2)
                tier_label = " ".join(rest[:2])
                tier_name = rest[2] if len(rest) > 2 else None
            description = text(tier.find("p"))
            price = text(tier.find("div", class_="pr"))
            quality_tiers.append({
                "label": tier_label,
                "name": tier_name,
                "description": description,
                "price_range": price,
            })

        # Major factories card: rt-fg → rt-fp items with .fn (name) and .ff (specialty)
        for fp in card.find_all("div", class_="rt-fp"):
            major_factories.append({
                "factory": text(fp.find("div", class_="fn")),
                "specialty": text(fp.find("div", class_="ff")),
            })

        # Community guides card: ul.rt-rl with span.lb (label) + span.ds (description)
        if h3_title and h3_title.lower() == "community guides":
            for li in card.find_all("li"):
                community_guides.append({
                    "name": text(li.find("span", class_="lb")),
                    "description": text(li.find("span", class_="ds")),
                })

        # Gold/wrapping/diamonds card: rt-gs subsections (h4 + p)
        for gs in card.find_all("div", class_="rt-gs"):
            gold_subsections.append({
                "title": text(gs.find("h4")),
                "description": text(gs.find("p")),
            })

        # Movements card: ul.rt-rl with span.lb + span.ds
        if h3_title and h3_title.lower() == "movements":
            for li in card.find_all("li"):
                movements_items.append({
                    "topic": text(li.find("span", class_="lb")),
                    "description": text(li.find("span", class_="ds")),
                })

        # Callouts inside any card
        for cb in card.find_all("div", class_="rt-cb"):
            callouts.append({**parse_callout(cb), "section": h3_title})

    # If li-based heuristics (lacking <strong>) misparsed, fall back to splitting on first known bold-like token via spans.
    return {
        "title": title,
        "intro": intro,
        "quality_tiers": quality_tiers,
        "major_factories": major_factories,
        "community_guides": community_guides,
        "gold_wrapping_diamonds": gold_subsections,
        "movements": movements_items,
        "callouts": callouts,
    }


# ---------- main ----------

def main():
    db = {
        "metadata": {
            "site": "reptime.help",
            "description": "Community-maintained reference for replica watch buyers — trusted dealers, factory guide, glossary, and newbie walkthrough.",
            "sections": [
                "trusted_dealers",
                "who_makes_the_best",
                "newbie_guide",
                "glossary",
                "factories",
            ],
        },
        "trusted_dealers": parse_td_list(),
        "who_makes_the_best": parse_who_makes_the_best(),
        "newbie_guide": parse_newbie_guide(),
        "glossary": parse_glossary(),
        "factories": parse_factories(),
    }

    # Stats
    db["stats"] = {
        "trusted_dealer_count": len(db["trusted_dealers"]["dealers"]),
        "who_makes_the_best_entries": len(db["who_makes_the_best"]),
        "glossary_term_count": sum(len(s["terms"]) for s in db["glossary"]),
        "glossary_category_count": len(db["glossary"]),
        "newbie_guide_step_count": len(db["newbie_guide"]["steps"]),
        "factory_quality_tier_count": len(db["factories"]["quality_tiers"]),
        "major_factory_count": len(db["factories"]["major_factories"]),
        "community_guide_count": len(db["factories"]["community_guides"]),
    }

    # Atomic write: write to .tmp, then rename. Prevents leaving a half-written
    # file if the process is interrupted while the lookup app is reading it.
    tmp = DST.with_suffix(DST.suffix + ".tmp")
    tmp.write_text(json.dumps(db, indent=2, ensure_ascii=False))
    os.replace(tmp, DST)
    print(f"Wrote {DST}")
    for k, v in db["stats"].items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
