# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


class GitJudge(gl.Contract):
    last_result: str

    def __init__(self):
        self.last_result = ""

    @gl.public.write
    def analyze(self, evidence_json: str) -> str:
        def leader_fn():
            evidence = json.loads(evidence_json)

            prompt = f"""
You are GitJudge, a neutral bounty reviewer.

Task:
Decide whether this PR satisfies the issue and repo docs.

Rules:
- Use only the provided evidence.
- Be strict and practical.
- Return JSON only.
- decision must be PASS or FAIL.
- score must be an integer from 0 to 100.
- requirements_met, missing, risk_flags must be arrays of short strings.
- summary must be one short paragraph.

Evidence:
{json.dumps(evidence, indent=2, ensure_ascii=False)}

Return exactly this JSON:
{{
  "decision": "PASS" or "FAIL",
  "score": 0,
  "summary": "short paragraph",
  "requirements_met": [],
  "missing": [],
  "risk_flags": []
}}
"""

            result = gl.nondet.exec_prompt(prompt, response_format='json')
            if not isinstance(result, dict):
                raise gl.UserError("LLM did not return a JSON object")

            normalized = {
                "decision": str(result.get("decision", "FAIL")).upper(),
                "score": int(result.get("score", 0)),
                "summary": str(result.get("summary", "")).strip(),
                "requirements_met": list(result.get("requirements_met", [])),
                "missing": list(result.get("missing", [])),
                "risk_flags": list(result.get("risk_flags", [])),
            }

            if normalized["decision"] not in ["PASS", "FAIL"]:
                normalized["decision"] = "FAIL"

            if normalized["score"] < 0:
                normalized["score"] = 0
            if normalized["score"] > 100:
                normalized["score"] = 100

            return normalized

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False

            data = leader_res.calldata
            if not isinstance(data, dict):
                return False

            if str(data.get("decision", "")).upper() not in ["PASS", "FAIL"]:
                return False

            score = data.get("score")
            if not isinstance(score, int) or score < 0 or score > 100:
                return False

            if not isinstance(data.get("summary", ""), str):
                return False

            for key in ["requirements_met", "missing", "risk_flags"]:
                value = data.get(key)
                if not isinstance(value, list):
                    return False
                if not all(isinstance(item, str) for item in value):
                    return False

            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_json = json.dumps(result, sort_keys=True, ensure_ascii=False)
        self.last_result = result_json
        return result_json

    @gl.public.view
    def get_last_result(self) -> str:
        return self.last_result
