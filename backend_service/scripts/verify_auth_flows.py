"""Scriptable smoke checks for setup/auth/onboarding endpoints.

Usage:
  API_URL=http://localhost:5000 python scripts/verify_auth_flows.py
"""
import os
import uuid
import requests

API_URL = os.environ.get("API_URL", "http://localhost:5000").rstrip("/")


def post(path, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API_URL}{path}", json=payload, headers=headers, timeout=10)


def get(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API_URL}{path}", headers=headers, timeout=10)


def main():
    print("1) bootstrap status", get("/api/bootstrap/status").status_code)

    base = uuid.uuid4().hex[:8]
    su_user = f"su_{base}"
    su_pass = "supersecure123"
    res = post("/api/bootstrap/superadmin", {"username": su_user, "password": su_pass})
    print("2) bootstrap superadmin", res.status_code)

    auth = post("/api/auth/credentials", {"username": su_user, "password": su_pass})
    print("3) superadmin login", auth.status_code)
    if auth.status_code != 200:
      return
    su_token = auth.json()["token"]

    inst_name = f"Business Program {base}"
    inst = post("/api/superadmin/institutions", {"name": inst_name}, token=su_token)
    print("4) institution create", inst.status_code)
    if inst.status_code != 201:
      return
    inst_code = inst.json()["registration_code"]

    reg_user = f"student_{base}"
    reg_pass = "passw0rd123"
    reg = post("/api/register", {
        "username": reg_user,
        "password": reg_pass,
        "accountType": "institution",
        "institutionCode": inst_code,
    })
    print("5) institution registration", reg.status_code)

    learner_auth = post("/api/auth/credentials", {"username": reg_user, "password": reg_pass})
    print("6) learner login", learner_auth.status_code)
    if learner_auth.status_code != 200:
      return
    learner_token = learner_auth.json()["token"]

    me = get("/api/session/me", token=learner_token)
    print("7) session me", me.status_code)


if __name__ == "__main__":
    main()
