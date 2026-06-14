"""
=======================================================
  PDF BATCH UNLOCKER — Anti-Gravity Project
  Handles: Owner Lock + User/Open Password Lock
  Input:   Batch folder of PDFs
  Output:  Unlocked PDFs saved to /output subfolder
           + summary report (unlock_report.csv)
=======================================================
"""

import os
import csv
import time
import pikepdf
from pathlib import Path


# ─────────────────────────────────────────────
# CONFIGURATION — Edit these before running
# ─────────────────────────────────────────────

INPUT_FOLDER  = "./input"       # Folder with locked PDFs
OUTPUT_FOLDER = "./output"      # Unlocked PDFs saved here
REPORT_FILE   = "./unlock_report.csv"

# Password list for User/Open locked PDFs
# Add known or common passwords here
PASSWORD_LIST = [
    "",              # Try blank password first (catches many cases)
    "1234",
    "12345",
    "password",
    "admin",
    "user",
    "pdf",
    "owner",
    "123456",
    "0000",
]


# ─────────────────────────────────────────────
# CORE LOGIC
# ─────────────────────────────────────────────

def detect_lock_type(pdf_path: str) -> dict:
    """
    Detect what kind of lock a PDF has.

    Returns:
        {
          "is_encrypted": bool,
          "needs_password": bool,   # True = User/Open lock
          "is_owner_locked": bool,  # True = Permission lock only
        }
    """
    result = {
        "is_encrypted": False,
        "needs_password": False,
        "is_owner_locked": False,
    }

    try:
        # Try opening WITHOUT any password
        pdf = pikepdf.open(pdf_path)
        pdf.close()

        # Opened fine — check if it has permission restrictions
        pdf = pikepdf.open(pdf_path)
        allow = pdf.allow
        pdf.close()

        if not all([
            allow.print_lowres,
            allow.print_highres,
            allow.modify_form,
            allow.modify_annotation,
            allow.modify_assembly,
            allow.modify_other,
            allow.extract,
            allow.accessibility,
        ]):
            result["is_encrypted"]    = True
            result["is_owner_locked"] = True

    except pikepdf.PasswordError:
        # Cannot open without password = User/Open lock
        result["is_encrypted"]   = True
        result["needs_password"] = True

    except Exception:
        pass

    return result


def unlock_owner_lock(pdf_path: str, output_path: str) -> dict:
    """
    Remove Owner/Permission lock.
    No password needed — just re-save without restrictions.
    """
    try:
        with pikepdf.open(pdf_path) as pdf:
            pdf.save(
                output_path,
                encryption=False   # Strip ALL encryption + permission flags
            )
        return {"success": True, "method": "owner_lock_stripped", "password_used": None}

    except Exception as e:
        return {"success": False, "method": "owner_lock_strip_failed", "error": str(e)}


def unlock_user_lock(pdf_path: str, output_path: str, passwords: list) -> dict:
    """
    Remove User/Open lock by trying each password in the list.
    If correct password found → decrypt and save clean PDF.
    """
    for pwd in passwords:
        try:
            with pikepdf.open(pdf_path, password=pwd) as pdf:
                pdf.save(
                    output_path,
                    encryption=False   # Save fully decrypted, no lock
                )
            return {
                "success": True,
                "method": "user_lock_decrypted",
                "password_used": repr(pwd),   # repr shows blank as ''
            }

        except pikepdf.PasswordError:
            continue   # Wrong password, try next

        except Exception as e:
            return {"success": False, "method": "decrypt_error", "error": str(e)}

    return {
        "success": False,
        "method": "all_passwords_failed",
        "error": f"None of the {len(passwords)} passwords worked",
    }


def process_pdf(pdf_path: str, output_folder: str) -> dict:
    """
    Master function: detect lock type → apply correct unlock method.
    Returns a result dict for logging.
    """
    filename    = Path(pdf_path).name
    output_path = os.path.join(output_folder, filename)

    print(f"\n  📄 Processing: {filename}")

    # Step 1: Detect lock type
    lock_info = detect_lock_type(pdf_path)

    # Step 2: If not encrypted at all, just copy
    if not lock_info["is_encrypted"]:
        import shutil
        shutil.copy2(pdf_path, output_path)
        print(f"     ✅ No lock detected — copied as-is")
        return {
            "file": filename,
            "lock_type": "none",
            "status": "copied",
            "method": "no_lock",
            "password_used": "",
            "error": "",
        }

    # Step 3: Owner/Permission lock
    if lock_info["is_owner_locked"] and not lock_info["needs_password"]:
        print(f"     🔓 Owner/Permission lock detected — stripping...")
        result = unlock_owner_lock(pdf_path, output_path)

        if result["success"]:
            print(f"     ✅ Unlocked successfully (owner lock stripped)")
        else:
            print(f"     ❌ Failed: {result.get('error')}")

        return {
            "file": filename,
            "lock_type": "owner_permission",
            "status": "success" if result["success"] else "failed",
            "method": result["method"],
            "password_used": "",
            "error": result.get("error", ""),
        }

    # Step 4: User/Open password lock
    if lock_info["needs_password"]:
        print(f"     🔐 User/Open password lock detected — trying {len(PASSWORD_LIST)} passwords...")
        result = unlock_user_lock(pdf_path, output_path, PASSWORD_LIST)

        if result["success"]:
            print(f"     ✅ Unlocked! Password was: {result['password_used']}")
        else:
            print(f"     ❌ Failed: {result.get('error')}")

        return {
            "file": filename,
            "lock_type": "user_open_password",
            "status": "success" if result["success"] else "failed",
            "method": result["method"],
            "password_used": result.get("password_used", ""),
            "error": result.get("error", ""),
        }

    # Fallback (shouldn't reach here)
    return {
        "file": filename,
        "lock_type": "unknown",
        "status": "skipped",
        "method": "unhandled_case",
        "password_used": "",
        "error": "Could not determine lock type",
    }


# ─────────────────────────────────────────────
# BATCH RUNNER
# ─────────────────────────────────────────────

def run_batch():
    print("=" * 55)
    print("  PDF BATCH UNLOCKER — Anti-Gravity Project")
    print("=" * 55)

    # Validate folders
    if not os.path.exists(INPUT_FOLDER):
        print(f"\n❌ ERROR: Input folder not found → {INPUT_FOLDER}")
        return

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    # Collect all PDFs
    pdf_files = sorted(Path(INPUT_FOLDER).glob("*.pdf"))

    if not pdf_files:
        print(f"\n⚠️  No PDF files found in: {INPUT_FOLDER}")
        return

    print(f"\n📁 Input folder  : {INPUT_FOLDER}")
    print(f"📁 Output folder : {OUTPUT_FOLDER}")
    print(f"📄 PDFs found    : {len(pdf_files)}")
    print(f"🔑 Passwords     : {len(PASSWORD_LIST)} in list")
    print("-" * 55)

    results   = []
    success   = 0
    failed    = 0
    copied    = 0
    start     = time.time()

    # Process each PDF
    for pdf_path in pdf_files:
        row = process_pdf(str(pdf_path), OUTPUT_FOLDER)
        results.append(row)

        if row["status"] == "success":  success += 1
        elif row["status"] == "copied": copied  += 1
        else:                           failed  += 1

    # ── Summary ──
    elapsed = round(time.time() - start, 2)
    print("\n" + "=" * 55)
    print(f"  BATCH COMPLETE in {elapsed}s")
    print(f"  ✅ Unlocked : {success}")
    print(f"  📋 Copied   : {copied}  (no lock)")
    print(f"  ❌ Failed   : {failed}")
    print("=" * 55)

    # ── Write CSV Report ──
    with open(REPORT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "file", "lock_type", "status", "method", "password_used", "error"
        ])
        writer.writeheader()
        writer.writerows(results)

    print(f"\n📊 Report saved → {REPORT_FILE}\n")


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    run_batch()
