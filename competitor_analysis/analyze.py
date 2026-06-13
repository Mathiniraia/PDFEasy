import json
from anthropic import Anthropic

URLS = [
    "https://smallpdf.com/protect-pdf",
    "https://www.ilovepdf.com/protect-pdf",
    "https://www.sejda.com/encrypt-pdf",
]

PROMPT_TEMPLATE = """
You are a ruthless competitive intelligence analyst for a PDF tool startup.

Fetch this page and extract a full competitive profile.
Return ONLY valid JSON — no markdown, no explanation.

JSON structure:
{{
  "competitor": "",
  "url": "",
  "headline": "",
  "subheadline": "",
  "cta_primary": "",
  "cta_secondary": "",
  "upload_methods": [],
  "file_size_limit": "",
  "password_options": {{
    "open_password": true,
    "permissions_password": true,
    "encryption_level": ""
  }},
  "permission_controls": [],
  "free_tier_limits": "",
  "paid_plan_nudge": "",
  "trust_signals": [],
  "social_proof": "",
  "step_count": 0,
  "steps": [],
  "upsell_triggers": [],
  "missing_features": [],
  "ux_friction_points": [],
  "tone": "",
  "target_audience": "",
  "mobile_optimized": true,
  "dark_patterns": [],
  "one_line_verdict": ""
}}

URL: {url}
"""

client = Anthropic()
results = []

for url in URLS:
    print(f"\n🔍 Analyzing: {url}")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2000,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": PROMPT_TEMPLATE.format(url=url)}]
        )
        raw = "".join(
            block.text for block in response.content if hasattr(block, "text")
        )
        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
            print(f"  ✅ Parsed successfully: {data.get('competitor', url)}")
        except json.JSONDecodeError:
            print(f"  ⚠️  JSON parse failed, saving raw")
            data = {"url": url, "error": "parse_failed", "raw": raw}
    except Exception as e:
        print(f"  ❌ Error: {e}")
        data = {"url": url, "error": str(e)}

    results.append(data)

output_path = "competitor_analysis/competitor_analysis.json"
with open(output_path, "w") as f:
    json.dump(results, f, indent=2)

print(f"\n✅ Done → {output_path}")
print("\n📊 QUICK SUMMARY:")
for r in results:
    if "error" not in r:
        print(f"\n  [{r.get('competitor', '?')}]")
        print(f"  Headline: {r.get('headline', 'N/A')}")
        print(f"  CTA: {r.get('cta_primary', 'N/A')}")
        print(f"  Free limit: {r.get('free_tier_limits', 'N/A')}")
        print(f"  Verdict: {r.get('one_line_verdict', 'N/A')}")
