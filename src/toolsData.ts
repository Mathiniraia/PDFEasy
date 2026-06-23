/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolDefinition } from "./types";

export const TOOLS: ToolDefinition[] = [
  // ================= TIER 1 =================
  {
    slug: "jpg-to-pdf",
    name: "JPG to PDF",
    description: "Convert sequences of JPG, JPEG, and PNG images into a clean single PDF file.",
    iconName: "FileImage",
    steps: [
      { title: "Upload Gallery", desc: "Select or drop image sequence files (JPG/PNG) into the staging box." },
      { title: "Arrange and Format", desc: "Verify image order and orientations before compilation." },
      { title: "Convert & Save", desc: "Run image placement rendering and download the bundled PDF." }
    ],
    faqs: [
      { q: "Can I combine different image formats?", a: "Yes, you can upload a mix of JPG, JPEG, and PNG files together to bundle into a single consolidated PDF." },
      { q: "Are my images compressed during PDF generation?", a: "The tool embeds the original images as PDF pages matching their native size and resolution to avoid rendering artifacts." },
      { q: "Does the PDF generation happen on the remote server?", a: "No. It uses your browser's optimized HTML5 canvas to load and process images, assuring standard swift outputs." }
    ],
    seoText: "Convert JPG and PNG images into a PDF quickly on any device. Excellent for compilation of photographic receipts, receipts tracking, physical document scans, and project presentation pages."
  },
  {
    slug: "pdf-to-jpg",
    name: "PDF to JPG",
    description: "Render and extract PDF pages into high-precision individual JPG images.",
    iconName: "FileImage",
    steps: [
      { title: "Upload Document", desc: "Drop your PDF file into the browser workspace." },
      { title: "Set Resolution", desc: "Choose optimal resolution for individual pages extraction." },
      { title: "Save Image Package", desc: "Initiate local canvas rendering and download a zip or list of image files." }
    ],
    faqs: [
      { q: "How are the images exported?", a: "Each PDF page is converted into a high-quality JPEG and offered for direct download inline in your browser." },
      { q: "What is the maximum file size supported?", a: "Standard file size limits up to 500MB are supported for swift execution (50MB for Unlock/Protect)." },
      { q: "Does this require any installation or registration?", a: "No. This tool is completely online and processes everything without complex installs." }
    ],
    seoText: "Convert PDF pages to JPG images in seconds. Render each vector layout flat into individual graphics, which are perfect for social shares, web content embedding, or offline graphic editing."
  },
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine multiple PDF documents into a single professional file instantly.",
    iconName: "Layers",
    steps: [
      { title: "Upload Files", desc: "Select and drag multiple PDF files into our workspace dropzone." },
      { title: "Arrange Order", desc: "Drag and drop to rearrange files in the exact sequence you want them." },
      { title: "Download Merged PDF", desc: "Click compile and download your combined document instantly with no quality loss." }
    ],
    faqs: [
      { q: "Is there a limit on how many files I can merge?", a: "No, you can combine multiple files seamlessly for standard production layouts." },
      { q: "Does merging PDFs compromise document security?", a: "No. Your documents are processed directly to maintain formatting and security standard controls." },
      { q: "Will the merged file retain original table formatting and links?", a: "Yes, pdf-lib merges the files at the binary level, preserving all links, formatting, fonts, and annotations." }
    ],
    seoText: "Combine multiple files into one PDF seamlessly with our modern Merge PDF tool. Specially designed for students, legal professionals, and remote managers who value speed. Optimized for rapid workflow execution."
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Optimize and compress PDF document size with smart scaling presets.",
    iconName: "Minimize2",
    steps: [
      { title: "Select PDF", desc: "Select high-disk-space PDFs to undergo optimization." },
      { title: "Choose Preset", desc: "Choose from extreme compression (low quality) or balanced compression (high quality)." },
      { title: "Optimized File", desc: "Witness instant disk-savings report and download the optimized smaller file." }
    ],
    faqs: [
      { q: "How does compression work locally?", a: "The optimizer targets unnecessary metadata streams, redundant fonts, and embeds smart asset structures to shrink sizes." },
      { q: "Will my images inside the PDF retain legibility?", a: "Yes, our balanced compression preset preserves text contrast and image outlines so they remain highly readable." },
      { q: "Are files uploaded to servers for processing?", a: "No, compression is carried out automatically using optimized rendering presets." }
    ],
    seoText: "Shrink high-density file footprints instantly using smart compression algorithms. Perfect for email attachments, online forms uploads, and archive indexing."
  },

  // ================= TIER 2 =================
  {
    slug: "pdf-to-word",
    name: "PDF to Word",
    description: "Convert PDF documents to editable Microsoft Word files seamlessly.",
    iconName: "FileText",
    steps: [
      { title: "Upload PDF", desc: "Select or drop the PDF file you need to convert." },
      { title: "Convert to DOCX", desc: "Our engine parses pages and matches formatting structure." },
      { title: "Save Word File", desc: "Download your newly created, fully editable Word document." }
    ],
    faqs: [
      { q: "Will the converted Word document keep the original formatting?", a: "Yes, our layout matching system attempts to preserve text placement, tables, and images." },
      { q: "Can I convert scanned PDFs to Word?", a: "Scanned PDFs will be rendered as images in the Word file, but you can edit them directly." },
      { q: "Is this tool free?", a: "Yes, it is part of our standard toolkit with standard daily limits." }
    ],
    seoText: "Convert PDF to Word document files online easily. Retain fonts, paragraphs, lists, and tables for editing."
  },
  {
    slug: "word-to-pdf",
    name: "Word to PDF",
    description: "Convert Microsoft Word documents into clean, standard PDF files.",
    iconName: "FileText",
    steps: [
      { title: "Upload Word File", desc: "Select or drop the DOC or DOCX file to undergo conversion." },
      { title: "Compile to PDF", desc: "Convert document layouts to universal standard PDF formatting." },
      { title: "Save PDF", desc: "Download the converted and ready-to-share standard PDF document." }
    ],
    faqs: [
      { q: "Which formats are supported?", a: "We support both standard .doc and .docx Microsoft Word documents." },
      { q: "Will my custom fonts be embedded?", a: "Yes, we attempt to preserve standard system fonts and embed layout properties directly." },
      { q: "How long does conversion take?", a: "The layout conversion runs instantly inside your modern workspace." }
    ],
    seoText: "Convert Word DOCX files to PDF online. Quick, secure conversion preserving tables, alignment, and graphics."
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    description: "Extract specific individual pages or split sections from your PDF file within seconds.",
    iconName: "Scissors",
    steps: [
      { title: "Upload PDF", desc: "Choose the target document you need to extract pages from." },
      { title: "Specify Pages", desc: "Input page numbers/ranges (e.g., 1-3, 5) or click on pages to extract." },
      { title: "Export Sections", desc: "Download the instantly created new PDF containing only your selected pages." }
    ],
    faqs: [
      { q: "How do I specify which pages to extract?", a: "You can enter standard ranges like '1-3, 5' or select pages visually. The engine will instantly parse and extract those." },
      { q: "Is split PDF quality as high as the original?", a: "Yes. It extracts original layout schemas without re-compressing individual objects, maintaining pristine professional quality." },
      { q: "Does the utility platform store a copy of my split files?", a: "Absolutely not. The splitting is processed on demand securely to maintain standard isolation." }
    ],
    seoText: "Extract pages from your PDF files with high-precision splitting. Ideal for sending single reports, distributing specific chapters of ebooks, or extracting customized layouts for simple sharing."
  },

  // ================= TIER 3 =================
  {
    slug: "delete-pdf-pages",
    name: "Delete PDF Pages",
    description: "Visually select, search, and remove unneeded pages from any PDF document.",
    iconName: "Trash2",
    steps: [
      { title: "Drop PDF", desc: "Select and preview your document structure cleanly in the canvas." },
      { title: "Toggle Pages", desc: "Click on pages you wish to delete to mark them for removal." },
      { title: "Apply & Export", desc: "Regenerate the filtered document and download the cleaned version." }
    ],
    faqs: [
      { q: "Can I undo selecting pages for deletion?", a: "Yes! Simply click the page thumbnail again to unmark it before exporting." },
      { q: "How many pages can I delete at once?", a: "As many as you want, provided you leave at least one page so a valid PDF can still be saved." },
      { q: "Does deleting pages reduce file size?", a: "Yes, the file size will shrink proportionally to the removed pages and their associated visual elements." }
    ],
    seoText: "Quickly delete pages from PDF files with our convenient interactive preview panel. Clean up draft comments, hide internal documents before sharing, or cull redundant blank indices instantly."
  },
  {
    slug: "edit-pdf",
    name: "Edit PDF",
    description: "Edit text, images, and layout elements directly inside your PDF.",
    iconName: "PenTool",
    steps: [
      { title: "Add Document", desc: "Upload the PDF file you wish to modify." },
      { title: "Make Edits", desc: "Use our interactive editor to add text, insert graphics, or change items." },
      { title: "Export PDF", desc: "Apply changes and download your newly edited PDF document." }
    ],
    faqs: [
      { q: "Can I edit existing text inside a PDF?", a: "Yes, you can edit text boxes, change fonts, and adjust alignment easily." },
      { q: "Can I add custom drawings or shapes?", a: "Yes, the edit board supports standard highlight shapes, pencil marks, and notes." },
      { q: "Is the output file watermark-free?", a: "Yes, Trust My PDF doesn't add any promotional watermarks to your custom edited files." }
    ],
    seoText: "Edit PDF files online with our complete workspace. Add text annotations, highlight fields, insert signs, and adjust pages."
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF Pages",
    description: "Orient individual pages or the entire document by 90, 180, or 270 degrees.",
    iconName: "RotateCw",
    steps: [
      { title: "Add Pages", desc: "Load the skewed PDF documents into the workspace." },
      { title: "Rotate Controls", desc: "Click the rotate action buttons to spin individual pages or all pages at once." },
      { title: "Save Setup", desc: "Apply rotation attributes locally and secure the perfect visual orientation." }
    ],
    faqs: [
      { q: "Can I rotate only horizontal landscape pages?", a: "Yes. You can rotate individual page thumbnails selectively or process the entire document at once." },
      { q: "Will the rotation change the original quality?", a: "No. The orientation metadata angle itself is updated at root binary layers without rasterizing contents." },
      { q: "Can I rotate pages multiple times?", a: "Yes. Each rotation click shifts the page 90 degrees clockwise. You can repeat to reach 180, 270, or 360 degrees." }
    ],
    seoText: "Straighten up scanned documents, sideways templates, and mismatched orientation receipts in your browser with our smart metadata transformation tool. Perfect alignment, zero delay."
  },

  // ================= TIER 4 =================
  {
    slug: "unlock-pdf",
    name: "Unlock PDF / Remove Password",
    description: "Create a decrypted PDF copy after entering the correct password.",
    iconName: "Lock",
    steps: [
      { title: "Select Protected PDF", desc: "Choose the password-secured PDF you want to open." },
      { title: "Enter Password", desc: "Type the correct password for this file." },
      { title: "Download Unlocked Copy", desc: "Save a copy that opens without the original password." }
    ],
    faqs: [
      { q: "Can I unlock a PDF if I do not know the password?", a: "No. You must enter the correct password to create an unlocked copy." },
      { q: "Is the unlocked file fully unencrypted?", a: "Yes. The exported copy opens without password prompts." },
      { q: "Does Trust My PDF keep my password?", a: "No. The password is used locally in your browser and is not stored or sent anywhere." }
    ],
    seoText: "Create unlocked PDF copies after entering the correct password. Perfect for preparing statements and records for easy sharing."
  },
  {
    slug: "protect-pdf",
    name: "Protect PDF",
    description: "Create a password-protected copy of your PDF with local browser encryption.",
    iconName: "Shield",
    steps: [
      { title: "Load Document", desc: "Choose the PDF you want to protect." },
      { title: "Set Password", desc: "Enter a password for the protected copy." },
      { title: "Download Protected Copy", desc: "Save the encrypted PDF and store the password safely." }
    ],
    faqs: [
      { q: "What kind of encryption is used?", a: "The browser applies PDF Standard Encryption, so common readers will prompt for the password." },
      { q: "Is my password sent anywhere?", a: "No. It stays in your browser while the PDF is being created." },
      { q: "Can you recover my password if I lose it?", a: "No. We do not store passwords, so please keep it somewhere safe." }
    ],
    seoText: "Create password-protected PDF copies directly in your browser. Ideal for legal, corporate, and official documents."
  },
  {
    slug: "sign-pdf",
    name: "Sign PDF",
    description: "Draw, type, or upload digital signatures and place them securely on your PDF.",
    iconName: "FileSignature",
    steps: [
      { title: "Select PDF", desc: "Upload the contract, agreement, or form that requires signing." },
      { title: "Create Signature", desc: "Draw with your mouse/trackpad, type your name, or upload an image." },
      { title: "Place & Save", desc: "Position your signature on any page, apply, and download the signed PDF." }
    ],
    faqs: [
      { q: "Is this signature legally binding?", a: "Yes, our eSign tool complies with standard electronic signature regulations for general agreements." },
      { q: "Can I add multiple signatures to one PDF?", a: "Yes, you can place multiple signature blocks across different pages as needed." },
      { q: "Is my signature kept secure?", a: "Absolutely. Your signature data is processed entirely locally and never stored on any remote disk." }
    ],
    seoText: "Sign PDF contracts and agreements online. Fill out forms, place electronic signatures, and securely finalize paperwork from any device."
  }
];
