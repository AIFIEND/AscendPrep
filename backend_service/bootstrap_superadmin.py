"""One-time bootstrap utility for first superadmin.

Usage:
  python bootstrap_superadmin.py --username owner --password 'StrongPass123!'
"""

import argparse
from app import app, db, User


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    if len(args.username.strip()) < 3:
        raise SystemExit("Username must be at least 3 characters.")
    if len(args.password) < 8:
        raise SystemExit("Password must be at least 8 characters.")

    with app.app_context():
        if User.query.filter_by(is_superadmin=True).count() > 0:
            raise SystemExit("Superadmin already exists. Bootstrap is one-time only.")
        if User.query.filter_by(username=args.username.strip()).first():
            raise SystemExit("Username already exists.")

        user = User(username=args.username.strip(), is_superadmin=True, is_admin=True, institution_id=None)
        user.set_password(args.password)
        db.session.add(user)
        db.session.commit()

        print(f"✅ Superadmin '{user.username}' created (id={user.id}).")


if __name__ == "__main__":
    main()
