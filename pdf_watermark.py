"""
PDF Watermark Utility for DDU B.Tech Notes Hub
Applies official university branding, verified contributor badges, and watermark overlays to study notes.
"""

import os
import sys
import io

# Ensure user-installed site-packages and local vendor directory are accessible
_base_dir = os.path.dirname(os.path.abspath(__file__))
_vendor_dir = os.path.join(_base_dir, "vendor")
if os.path.exists(_vendor_dir) and _vendor_dir not in sys.path:
    sys.path.insert(0, _vendor_dir)

_user_site = os.path.expanduser("~/.local/lib/python3.13/site-packages")
if os.path.exists(_user_site) and _user_site not in sys.path:
    sys.path.insert(0, _user_site)

def is_watermark_available():
    """Checks if required PDF processing libraries (pypdf & reportlab) are available."""
    try:
        import pypdf
        import reportlab
        return True
    except ImportError:
        return False

def watermark_pdf_bytes(pdf_bytes: bytes, watermark_text: str = "DDU B.TECH NOTES HUB", student_name: str = "", note_title: str = "") -> bytes:
    """
    Overlays a professional diagonal watermark and branded header/footer onto every page of a PDF.
    Returns the watermarked PDF as bytes.
    If libraries are missing or an error occurs, gracefully returns original pdf_bytes.
    """
    if not is_watermark_available() or not pdf_bytes:
        return pdf_bytes

    try:
        from reportlab.lib import colors
        from reportlab.pdfgen import canvas
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()

        clean_wm_text = (watermark_text or "DDU B.TECH NOTES HUB").strip()
        display_title = (note_title or "B.Tech Lecture Notes").strip()
        if len(display_title) > 45:
            display_title = display_title[:42] + "..."

        contributor_text = f"Contributed by {student_name}" if student_name else "Verified Student Contribution"

        for page in reader.pages:
            mb = page.mediabox
            w = float(mb.width)
            h = float(mb.height)

            packet = io.BytesIO()
            can = canvas.Canvas(packet, pagesize=(w, h))
            can.saveState()

            # 1. Top Branded Bar (Header)
            can.setFillColor(colors.HexColor("#1e40af"), alpha=0.92)
            can.setFont("Helvetica-Bold", 8)
            can.drawString(20, h - 16, f"🎓 DDU B.TECH NOTES HUB | {display_title}")

            can.setFont("Helvetica", 7.5)
            can.setFillColor(colors.HexColor("#475569"), alpha=0.85)
            can.drawRightString(w - 20, h - 16, contributor_text)

            # 2. Diagonal Semi-Transparent Center Watermark
            can.setFillColor(colors.HexColor("#0f172a"), alpha=0.10)
            font_size = max(18.0, min(w, h) * 0.052)
            can.setFont("Helvetica-Bold", font_size)

            can.translate(w / 2.0, h / 2.0)
            can.rotate(45)
            can.drawCentredString(0, 0, clean_wm_text)
            can.restoreState()

            # 3. Bottom Footer
            can.saveState()
            can.setFillColor(colors.HexColor("#64748b"), alpha=0.80)
            can.setFont("Helvetica", 7.5)
            can.drawCentredString(
                w / 2.0,
                12,
                "https://ddu-btech-kn-notes.vercel.app/ • Free Educational Access for DDU University Students"
            )
            can.restoreState()

            can.save()
            packet.seek(0)

            wm_reader = PdfReader(packet)
            page.merge_page(wm_reader.pages[0])
            writer.add_page(page)

        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()

    except Exception as e:
        print(f"[pdf_watermark] Watermark processing failed, using original PDF: {e}")
        return pdf_bytes
