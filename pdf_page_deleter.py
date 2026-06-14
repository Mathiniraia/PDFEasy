"""
===================================================================
  PDF PAGE DELETER & PREVIEW GENERATOR — Anti-Gravity Project
  Handles: Page culling (deletion) + High-quality page preview generation
  Engine:  PyMuPDF (fitz) — Ultra-fast, self-contained rendering
===================================================================
"""

import os
import sys
from pathlib import Path
from typing import List, Dict, Union

# Try to import PyMuPDF (fitz)
try:
    import fitz
except ImportError:
    print("\n❌ Error: PyMuPDF is required to run this script.")
    print("👉 Install it using: pip install pymupdf\n")
    sys.exit(1)


def generate_page_previews(
    pdf_path: str, 
    output_dir: str, 
    dpi: int = 150, 
    password: str = ""
) -> Dict[str, Union[bool, List[str], str]]:
    """
    Renders every page of a PDF as a high-quality PNG image for previewing.
    
    Args:
        pdf_path: Path to the input PDF file.
        output_dir: Directory where preview images will be saved.
        dpi: Dots per inch for rendering resolution (default 150).
        password: User password if the PDF is password-protected.
        
    Returns:
        A dictionary containing success status, list of generated image paths, and/or error messages.
    """
    os.makedirs(output_dir, exist_ok=True)
    generated_images = []
    
    try:
        # Open the PDF document
        doc = fitz.open(pdf_path)
        
        # Handle password lock if necessary
        if doc.is_encrypted:
            if not doc.authenticate(password):
                return {
                    "success": False, 
                    "error": "Authentication failed. Incorrect password.", 
                    "images": []
                }
                
        total_pages = len(doc)
        print(f"📄 Loaded PDF: '{Path(pdf_path).name}' ({total_pages} pages)")
        print(f"📸 Generating page previews in '{output_dir}'...")
        
        # Render each page
        for page_num in range(total_pages):
            page = doc.load_page(page_num)
            
            # Use zoom/matrix for DPI configuration (default matrix is 72 DPI)
            zoom = dpi / 72
            matrix = fitz.Matrix(zoom, zoom)
            
            # Render page to image pixel map (pixmap)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            
            # Format output filename: page_001.png, page_002.png, etc.
            img_filename = f"page_{page_num + 1:03d}.png"
            img_path = os.path.join(output_dir, img_filename)
            
            # Save pixmap to disk
            pix.save(img_path)
            generated_images.append(img_path)
            print(f"   ✅ Saved: {img_filename}")
            
        doc.close()
        return {
            "success": True, 
            "images": generated_images, 
            "total_pages": total_pages
        }
        
    except Exception as e:
        return {
            "success": False, 
            "error": str(e), 
            "images": []
        }


def delete_pages_and_save(
    pdf_path: str, 
    output_path: str, 
    pages_to_delete: List[int], 
    password: str = ""
) -> Dict[str, Union[bool, str]]:
    """
    Deletes specified 1-based page numbers from a PDF and saves the clean version.
    
    Args:
        pdf_path: Path to the input PDF file.
        output_path: Path where the new culled PDF should be saved.
        pages_to_delete: List of 1-based page numbers to remove (e.g. [2, 5]).
        password: User password if the PDF is password-protected.
        
    Returns:
        A dictionary containing success status and/or error messages.
    """
    try:
        # Open PDF
        doc = fitz.open(pdf_path)
        
        if doc.is_encrypted:
            if not doc.authenticate(password):
                return {"success": False, "error": "Authentication failed. Incorrect password."}
                
        total_pages = len(doc)
        
        # Map 1-based page numbers to 0-based indices
        delete_indices = [p - 1 for p in pages_to_delete if 1 <= p <= total_pages]
        
        # Sort indices in descending order to avoid shift during removal
        delete_indices = sorted(list(set(delete_indices)), reverse=True)
        
        if not delete_indices:
            return {"success": False, "error": "No valid page numbers provided for deletion."}
            
        if len(delete_indices) >= total_pages:
            return {"success": False, "error": "Cannot delete all pages. At least one page must remain."}
            
        print(f"\n✂️  Culling {len(delete_indices)} pages from '{Path(pdf_path).name}'...")
        
        # Delete pages one by one (descending order guarantees indices remain valid)
        for idx in delete_indices:
            doc.delete_page(idx)
            print(f"   🗑️ Removed page {idx + 1}")
            
        # Save output PDF with stripped restrictions/encryption
        doc.save(output_path, garbage=3, deflate=True)
        doc.close()
        
        print(f"💾 Saved updated PDF to: '{output_path}'")
        return {"success": True}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────
# EXAMPLE RUNNER / INTERACTIVE CLI
# ─────────────────────────────────────────────

def run_interactive():
    print("=" * 65)
    print("  PDF PAGE DELETER & PREVIEW GENERATOR — Anti-Gravity Project")
    print("=" * 65)
    
    # 1. Get input PDF path
    pdf_path = input("\n📂 Enter path to input PDF file: ").strip()
    if not os.path.exists(pdf_path):
        print("❌ Error: File not found.")
        return
        
    password = ""
    # Check if encrypted to prompt password
    try:
        test_doc = fitz.open(pdf_path)
        is_encrypted = test_doc.is_encrypted
        test_doc.close()
    except Exception as e:
        print(f"❌ Error loading file: {e}")
        return
        
    if is_encrypted:
        password = input("🔑 PDF is encrypted. Enter password: ").strip()
        
    # 2. Setup folders
    previews_dir = "./previews"
    
    # 3. Generate Previews
    preview_res = generate_page_previews(pdf_path, previews_dir, dpi=120, password=password)
    
    if not preview_res["success"]:
        print(f"\n❌ Error generating previews: {preview_res.get('error')}")
        return
        
    total_pages = preview_res["total_pages"]
    print(f"\n✅ Previews generated in '{previews_dir}/'")
    print(f"   Total Pages: {total_pages}")
    
    # 4. Ask which pages to delete
    print("\n🔍 Look at the generated image previews to decide which pages to cull.")
    try:
        pages_input = input("✂️  Enter page numbers to DELETE (comma-separated, e.g. 2, 4): ")
        if not pages_input.strip():
            print("⚠️ No pages selected. Exiting without changes.")
            return
            
        pages_to_delete = [int(p.strip()) for p in pages_input.split(",") if p.strip().isdigit()]
    except ValueError:
        print("❌ Invalid input. Please enter numbers separated by commas.")
        return
        
    # 5. Output PDF Destination
    output_pdf = input("💾 Enter path to save output PDF (default: output_culled.pdf): ").strip()
    if not output_pdf:
        output_pdf = "output_culled.pdf"
        
    # 6. Execute Deletion
    del_res = delete_pages_and_save(pdf_path, output_pdf, pages_to_delete, password)
    
    if del_res["success"]:
        print("\n🎉 Process completed successfully!")
    else:
        print(f"\n❌ Failed to save modified PDF: {del_res.get('error')}")


if __name__ == "__main__":
    # If run directly, offer the interactive CLI
    run_interactive()
