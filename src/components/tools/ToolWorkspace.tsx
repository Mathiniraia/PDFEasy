/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  FileText, CheckCircle, RefreshCw, Download, 
  Trash2, RotateCw, Shield, AlertTriangle,
  Scissors, FileImage, Layers, ShieldCheck, Minimize2,
  Lock, Plus, X, ArrowRight, Settings, Check, Clock, Calendar, Sparkles, ChevronRight
} from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { PDFFileInfo, ToolWorkspaceProps } from "../../types";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { decryptPDF, isEncrypted as checkIsEncrypted } from "@pdfsmaller/pdf-decrypt";

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

<<<<<<< HEAD
// Set the worker source once at module level to match the installed pdfjs-dist version.
// Using a Vite ?url import guarantees the worker version matches the library.
=======
>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function ToolWorkspace({
  tool,
  onLimitExceeded,
  usageCount,
  incrementUsage
}: ToolWorkspaceProps) {
  // Main states
  // 1 = Dropzone / Interactive Setup, 2 = Processing, 3 = Success / Download Window
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<PDFFileInfo[]>([]);
  const [processingMessage, setProcessingMessage] = useState("Processing your files...");
  
  // Success state stats
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputFileName, setOutputFileName] = useState("");
  const [originalSize, setOriginalSize] = useState(0);
  const [newSize, setNewSize] = useState(0);
  const [pageCountOutput, setPageCountOutput] = useState(0);

  // File drag & hover state
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState("");

  // Target values for specific tools
  // split-pdf
  const [splitRange, setSplitRange] = useState("1");
  const [pagesToSplit, setPagesToSplit] = useState<number[]>([]);
  // protect-pdf / unlock-pdf
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [existingPassword, setExistingPassword] = useState(""); // for already-encrypted PDFs
  // rotate-pdf (track rotation of each page if single-file)
  const [pageRotations, setPageRotations] = useState<number[]>([]); // values: 0, 90, 180, 270
  // delete-pdf-pages (track indices of pages to delete)
  const [pagesToDelete, setPagesToDelete] = useState<number[]>([]);
  // compress-pdf preset
  const [compressionMode, setCompressionMode] = useState<"balanced" | "extreme">("balanced");

  // Local helper for page counts of single files
  const [singleFileTotalPages, setSingleFileTotalPages] = useState(0);

  // Previews & Encryption States
  const [pdfPreviews, setPdfPreviews] = useState<string[]>([]);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [pdfAlreadyEncrypted, setPdfAlreadyEncrypted] = useState(false);

  // ── AI Summarization States ──────────────────────────────────────────────
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiError, setAiError] = useState("");

  // Refs to always capture latest passwords without stale closure in async handlers
  const passwordRef = useRef<string>("");
  const confirmPasswordRef = useRef<string>("");
  const existingPasswordRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When changing tools, reset workspace states
  useEffect(() => {
    resetStates();
  }, [tool.slug]);

  const resetStates = () => {
    setStage(1);
    setFiles([]);
    setDragError("");
    setSplitRange("1");
    setPagesToSplit([]);
    setPassword("");
    passwordRef.current = "";
    setConfirmPassword("");
    confirmPasswordRef.current = "";
    setShowPassword(false);
    setShowConfirmPassword(false);
    setExistingPassword("");
    existingPasswordRef.current = "";
    setPageRotations([]);
    setPagesToDelete([]);
    setSingleFileTotalPages(0);
    setOutputBlob(null);
    setOriginalSize(0);
    setNewSize(0);
    setPdfPreviews([]);
    setIsGeneratingPreviews(false);
    setIsEncrypted(false);
    setPdfAlreadyEncrypted(false);
    // Reset AI states
    setAiPanelOpen(false);
    setAiSummary("");
    setAiError("");
    setAiLoading(false);
  };

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setDragError("");

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploadedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setDragError("");
    if (e.target.files && e.target.files.length > 0) {
      await processUploadedFiles(Array.from(e.target.files));
    }
  };

  // Read files and parse page counts using simple PDF stream inspection or pdf-lib
  const processUploadedFiles = async (rawFiles: File[]) => {
    try {
      const isJpgToPdf = tool.slug === "jpg-to-pdf";
      const validFiles: PDFFileInfo[] = [];
      const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB limit

      for (const file of rawFiles) {
        // File size guard
        if (file.size > MAX_FILE_SIZE) {
          setDragError(`File "${file.name}" exceeds the 200MB limit. Please use a smaller file.`);
          return;
        }

        // Validation checks
        if (isJpgToPdf) {
          if (!file.type.match(/image\/(jpeg|png|jpg)/)) {
            setDragError("Only PNG or JPEG/JPG images are supported.");
            return;
          }
        } else {
          if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
            setDragError("Only PDF files are accepted. Please upload a valid PDF.");
            return;
          }
        }

        // Read file bytes
        const bytes = await readFileAsBytes(file);
        let pageCount = 0;
        let fileIsLocked = false;

        if (!isJpgToPdf) {
          try {
            // Use ignoreEncryption:true to get page count even from encrypted PDFs.
            // Copy bytes to avoid ArrayBuffer detachment issues.
            const loadBytes = new Uint8Array(bytes);
            const pdfDoc = await PDFDocument.load(loadBytes, { ignoreEncryption: true });
            pageCount = pdfDoc.getPageCount();
            fileIsLocked = false;
          } catch (e: any) {
            // Un-decryptable or encrypted already
            pageCount = 1;
            fileIsLocked = true;
          }
        }

        // Store file info
        const fileInfo: PDFFileInfo = {
          name: file.name,
          size: file.size,
          type: file.type,
          pageCount: isJpgToPdf ? 1 : pageCount,
          pdfBytes: bytes,
        };

        // For jpg images, generate pre-vis data-urls if requested
        if (isJpgToPdf) {
          fileInfo.dataUrl = await readFileAsDataUrl(file);
        }

        setIsEncrypted(fileIsLocked);

        if (!isJpgToPdf && tool.slug === "protect-pdf") {
          try {
            const encInfo = await checkIsEncrypted(bytes);
            setPdfAlreadyEncrypted(encInfo.encrypted);
          } catch {
            setPdfAlreadyEncrypted(fileIsLocked);
          }
        }

        validFiles.push(fileInfo);
      }

      if (tool.slug === "merge-pdf") {
        setFiles(prev => [...prev, ...validFiles]);
      } else {
        // Other tools generally process one file at a time
        const targetFile = validFiles[0];
        setFiles([targetFile]);
        if (targetFile.pageCount) {
          setSingleFileTotalPages(targetFile.pageCount);
          setPageRotations(new Array(targetFile.pageCount || 0).fill(0));
          setPagesToDelete([]);
          setPagesToSplit(Array.from({ length: targetFile.pageCount || 0 }, (_, i) => i));
          setSplitRange(`1-${targetFile.pageCount}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      setDragError("Unable to open the selected document.");
    }
  };

  const readFileAsBytes = (file: File): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else {
          reject(new Error("ArrayBuffer load error"));
        }
      };
      reader.onerror = () => reject(reader.onerror);
      reader.readAsArrayBuffer(file);
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  };

  const generatePreviews = async (pdfDocBytes: Uint8Array, userPassword?: string): Promise<string[]> => {
    try {
      setPdfPreviews([]);
<<<<<<< HEAD
      // Worker source is set at module level via the ?url import.
      
      // IMPORTANT: Copy the bytes so pdf.js doesn't detach the underlying ArrayBuffer
      // which would break subsequent pdf-lib operations on the same file.
      const bytesCopy = new Uint8Array(pdfDocBytes);
=======

>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
      const loadingTask = pdfjsLib.getDocument({ 
        data: bytesCopy,
        password: userPassword
      });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const urlArr: string[] = [];

      const limit = Math.min(numPages, 30);
      for (let i = 1; i <= limit; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (canvas && ctx) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: ctx,
            viewport: viewport
          } as any).promise;

          const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
          urlArr.push(dataUrl);
        }
      }
      setPdfPreviews(urlArr);
      setIsEncrypted(false);
      return urlArr;
    } catch (err: any) {
      console.warn("Unable to generate PDF pages previews:", err.message);
      if (err.name === "PasswordException") {
        setIsEncrypted(true);
      }
      return [];
    }
  };

  const testUnlockAndGeneratePreviews = async () => {
    setIsGeneratingPreviews(true);
    setDragError("");
    try {
      if (files.length > 0 && files[0].pdfBytes) {
        const pdfDoc = await PDFDocument.load(files[0].pdfBytes, { password: password } as any);
        const count = pdfDoc.getPageCount();
        setSingleFileTotalPages(count);
        setPagesToSplit(Array.from({ length: count }, (_, i) => i));
        
        await generatePreviews(files[0].pdfBytes, password);
      }
    } catch (err: any) {
      setDragError("Invalid document password. Please check and try again.");
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  // Previews effect trigger
  useEffect(() => {
    if (files.length > 0 && files[0].pdfBytes && tool.slug !== "jpg-to-pdf") {
      setIsGeneratingPreviews(true);
      generatePreviews(files[0].pdfBytes, password).finally(() => {
        setIsGeneratingPreviews(false);
      });
    } else {
      setPdfPreviews([]);
      setIsEncrypted(false);
    }
  }, [files, tool.slug]);

  const triggerUploadClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (files.length <= 1) {
      setSingleFileTotalPages(0);
      setPageRotations([]);
      setPagesToDelete([]);
    }
  };

  // Reorder for Merge tool
  const moveFile = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === files.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const updated = [...files];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setFiles(updated);
  };

  // ROTATION interaction
  const rotatePage = (pageIdx: number) => {
    setPageRotations(prev => {
      const copy = [...prev];
      copy[pageIdx] = (copy[pageIdx] + 90) % 360;
      return copy;
    });
  };

  const rotateAllPages = () => {
    setPageRotations(prev => prev.map(rot => (rot + 90) % 360));
  };

  // DELETION interaction
  const togglePageDeletion = (pageIdx: number) => {
    setPagesToDelete(prev => {
      if (prev.includes(pageIdx)) {
        return prev.filter(i => i !== pageIdx);
      } else {
        // Safeguard: must retain at least one page
        if (prev.length >= singleFileTotalPages - 1) {
          return prev; // refuse to delete the very last remaining page
        }
        return [...prev, pageIdx];
      }
    });
  };

  // SPLIT interaction
  const togglePageSplit = (pageIdx: number) => {
    setPagesToSplit(prev => {
      if (prev.includes(pageIdx)) {
        return prev.filter(i => i !== pageIdx);
      } else {
        return [...prev, pageIdx];
      }
    });
  };

  const syncPasswordRefs = () => {
    passwordRef.current = password;
    existingPasswordRef.current = existingPassword;
  };

  // CORE CLIENT-SIDE HEAVY LIFTING METRIC PROCESSOR
  const executePDFAction = async () => {
    syncPasswordRefs();
    console.log("[PDF Easy] executePDFAction called, tool:", tool.slug);
    console.log("[PDF Easy] passwordRef.current:", passwordRef.current ? `"${passwordRef.current}" (${passwordRef.current.length} chars)` : "EMPTY");
    console.log("[PDF Easy] files:", files.length, files[0]?.name);
    console.log("[PDF Easy] localStorage usage:", localStorage.getItem("pdf_app_usage"));

    // 1. Guard check attempts counter in daily hook
    const proceed = await incrementUsage();
    console.log("[PDF Easy] incrementUsage() returned:", proceed);
    if (!proceed) {
      console.warn("[PDF Easy] BLOCKED by usage limit — paywall shown");
      onLimitExceeded();
      return;
    }

    setStage(2); // Processing

    try {
      if (tool.slug === "merge-pdf") {
        setProcessingMessage("Merging your PDF documents into one combined clean structure...");
        await doMergePDF();
      } else if (tool.slug === "split-pdf") {
        setProcessingMessage("Extracting selected individual pages and compiling ZIP bundle...");
        await doSplitPDF();
      } else if (tool.slug === "jpg-to-pdf") {
        setProcessingMessage("Converting image sequences and rendering layout alignments...");
        await doJpgToPdf();
      } else if (tool.slug === "pdf-to-jpg") {
        setProcessingMessage("Rasterizing PDF vector page alignments to pristine standalone formats...");
        await doPdfToJpg();
      } else if (tool.slug === "delete-pdf-pages") {
        setProcessingMessage("Culling marked indexes and reconstructing output streams...");
        await doDeletePages();
      } else if (tool.slug === "rotate-pdf") {
        setProcessingMessage("Updating geometry viewport and rotation meta layouts...");
        await doRotatePages();
      } else if (tool.slug === "compress-pdf") {
        setProcessingMessage("Optimizing font tables, compressing binary streams, and scaling data objects...");
        await doCompressPDF();
      } else if (tool.slug === "protect-pdf") {
        setProcessingMessage("Applying user-specific AES 128-bit encryption hashes and lock attributes...");
        await doProtectPDF();
      } else if (tool.slug === "unlock-pdf") {
        setProcessingMessage("Decrypting, removing file permissions lock, and stripping passkey structures...");
        await doUnlockPDF();
      }
    } catch (err: any) {
      console.error("[PDF Easy] CAUGHT ERROR:", err);
      console.error("[PDF Easy] Error message:", err?.message);
      console.error("[PDF Easy] Error stack:", err?.stack);
      // Show a clean user-friendly message, never expose stack traces
      const userMsg = err?.message && err.message.length < 200
        ? err.message
        : "Something went wrong. Please try again with a different file.";
      setDragError(userMsg);
      setStage(1);
    }
  };

  // 1. MERGE ENGINE
  const doMergePDF = async () => {
    if (files.length === 0) throw new Error("No files in the queue");
    
    const mergedDoc = await PDFDocument.create();
    let totalPagesCount = 0;
    let totalOrigBytesSize = 0;

    for (const f of files) {
      if (!f.pdfBytes) continue;
      totalOrigBytesSize += f.size;
      // Copy bytes to avoid ArrayBuffer detachment issues
      const bytesCopy = new Uint8Array(f.pdfBytes);
      const donorDoc = await PDFDocument.load(bytesCopy, { ignoreEncryption: true });
      const donorPageCount = donorDoc.getPageCount();
      const pagesToCopy = Array.from({ length: donorPageCount }, (_, i) => i);
      const copiedPages = await mergedDoc.copyPages(donorDoc, pagesToCopy);
      
      for (const page of copiedPages) {
        mergedDoc.addPage(page);
        totalPagesCount++;
      }
    }

    const mergedBytes = await mergedDoc.save();
    const finalBlob = new Blob([mergedBytes], { type: "application/pdf" });
    
    setOriginalSize(totalOrigBytesSize);
    setNewSize(mergedBytes.length);
    setPageCountOutput(totalPagesCount);
    setOutputBlob(finalBlob);
    setOutputFileName("merged_document.pdf");
    setStage(3);
  };

  // 2. SPLIT ENGINE
  const doSplitPDF = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("Please add your document");

<<<<<<< HEAD
    const bytesCopy = new Uint8Array(f.pdfBytes);
    const pdfDoc = await PDFDocument.load(bytesCopy, { ignoreEncryption: true });
=======
    const splitPassword = passwordRef.current.trim() || password.trim();
    let sourceBytes = f.pdfBytes;

    const encInfo = await checkIsEncrypted(sourceBytes);
    if (encInfo.encrypted) {
      if (!splitPassword) {
        throw new Error("This PDF is password-protected. Enter the password first.");
      }
      sourceBytes = await decryptPDF(sourceBytes, splitPassword);
    }

    const pdfDoc = await PDFDocument.load(sourceBytes);
>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
    const count = pdfDoc.getPageCount();

    // Use selected split list or range
    const selectedIndices = pagesToSplit.length > 0 ? pagesToSplit : Array.from({ length: count }, (_, i) => i);
    
    if (selectedIndices.length === 0) {
      throw new Error("No pages selected for splitting.");
    }

    let finalBlob: Blob;
    let finalFileName = "";

    // If only 1 page is selected, just export it directly as PDF instead of ZIP
    if (selectedIndices.length === 1) {
      const idx = selectedIndices[0];
      const singlePageDoc = await PDFDocument.create();
      const copiedPages = await singlePageDoc.copyPages(pdfDoc, [idx]);
      singlePageDoc.addPage(copiedPages[0]);
      
      const singlePageBytes = await singlePageDoc.save();
      finalBlob = new Blob([singlePageBytes], { type: "application/pdf" });
      finalFileName = `${f.name.replace(/\.pdf$/i, "")}_page_${idx + 1}.pdf`;
    } else {
      // Multiple pages -> create a ZIP file
      const zip = new JSZip();

      for (const idx of selectedIndices) {
        const singlePageDoc = await PDFDocument.create();
        const copiedPages = await singlePageDoc.copyPages(pdfDoc, [idx]);
        singlePageDoc.addPage(copiedPages[0]);
        
        const singlePageBytes = await singlePageDoc.save();
        zip.file(`${f.name.replace(/\.pdf$/i, "")}_page_${idx + 1}.pdf`, singlePageBytes);
      }

      finalBlob = await zip.generateAsync({ type: "blob" });
      finalFileName = `split_pages_${f.name.replace(/\.pdf$/i, "")}.zip`;
    }

    setOriginalSize(f.size);
    setNewSize(finalBlob.size);
    setPageCountOutput(selectedIndices.length);
    setOutputBlob(finalBlob);
    setOutputFileName(finalFileName);
    setStage(3);
  };

  // 3. JPG TO PDF ENGINE
  const doJpgToPdf = async () => {
    if (files.length === 0) throw new Error("Please upload images first.");
    
    const pdfDoc = await PDFDocument.create();
    let totalOrigBytes = 0;

    for (const f of files) {
      if (!f.pdfBytes) continue;
      totalOrigBytes += f.size;
      
      const page = pdfDoc.addPage();
      let imageObj;
      
      if (f.type.includes("png")) {
        imageObj = await pdfDoc.embedPng(f.pdfBytes);
      } else {
        imageObj = await pdfDoc.embedJpg(f.pdfBytes);
      }

      const { width, height } = imageObj.scale(1);
      page.setSize(width, height);
      page.drawImage(imageObj, {
        x: 0,
        y: 0,
        width: width,
        height: height
      });
    }

    const saveBytes = await pdfDoc.save();
    const finalBlob = new Blob([saveBytes], { type: "application/pdf" });

    setOriginalSize(totalOrigBytes);
    setNewSize(saveBytes.length);
    setPageCountOutput(files.length);
    setOutputBlob(finalBlob);
    setOutputFileName("images_package_output.pdf");
    setStage(3);
  };

  // 4. PDF TO JPG ENGINE
  // Uses pdf.js to render each page to canvas, then exports as JPEG.
  // CRITICAL: generatePreviews returns the data-URL array directly — do NOT
  // re-read `pdfPreviews` state since React setState is asynchronous.
  const doPdfToJpg = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("No PDF loaded");

    // Use the return value, NOT the React state (which updates asynchronously)
    let activePreviews = pdfPreviews.length > 0
      ? pdfPreviews
      : await generatePreviews(f.pdfBytes, password);

    if (activePreviews.length === 0) {
      throw new Error("Could not convert PDF pages to images. The file may be corrupted or password-protected.");
    }

    let finalBlob: Blob;
    let filename = "";

    if (activePreviews.length === 1) {
      const resp = await fetch(activePreviews[0]);
      finalBlob = await resp.blob();
      filename = `${f.name.replace(/\.pdf$/i, "")}_page_1.jpg`;
    } else {
      const zip = new JSZip();
      for (let i = 0; i < activePreviews.length; i++) {
        const imgDataUrl = activePreviews[i];
        const base64Data = imgDataUrl.split(",")[1];
        zip.file(`${f.name.replace(/\.pdf$/i, "")}_page_${i + 1}.jpg`, base64Data, { base64: true });
      }
      finalBlob = await zip.generateAsync({ type: "blob" });
      filename = `${f.name.replace(/\.pdf$/i, "")}_images.zip`;
    }

    setOriginalSize(f.size);
    setNewSize(finalBlob.size);
    setPageCountOutput(activePreviews.length);
    setOutputBlob(finalBlob);
    setOutputFileName(filename);
    setStage(3);
  };

  // 5. DELETE PAGES ENGINE
  const doDeletePages = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("No PDF loaded");

    const bytesCopy = new Uint8Array(f.pdfBytes);
    const pdfDoc = await PDFDocument.load(bytesCopy, { ignoreEncryption: true });
    const totalCount = pdfDoc.getPageCount();

    const keepIndices: number[] = [];
    for (let i = 0; i < totalCount; i++) {
      if (!pagesToDelete.includes(i)) {
        keepIndices.push(i);
      }
    }

    if (keepIndices.length === 0) {
      throw new Error("You cannot delete all pages inside this document. File requires at least 1 remaining page.");
    }

    const cleanDoc = await PDFDocument.create();
    const copiedPages = await cleanDoc.copyPages(pdfDoc, keepIndices);
    copiedPages.forEach(p => cleanDoc.addPage(p));

    const saveBytes = await cleanDoc.save();
    const finalBlob = new Blob([saveBytes], { type: "application/pdf" });

    setOriginalSize(f.size);
    setNewSize(saveBytes.length);
    setPageCountOutput(keepIndices.length);
    setOutputBlob(finalBlob);
    setOutputFileName(`cleaned_${f.name}`);
    setStage(3);
  };

  // 6. ROTATE ENGINE
  const doRotatePages = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("No PDF loaded");

    const bytesCopy = new Uint8Array(f.pdfBytes);
    const pdfDoc = await PDFDocument.load(bytesCopy, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
      const currentRotDeg = pageRotations[i] || 0;
      if (currentRotDeg !== 0) {
        const existingRot = pages[i].getRotation().angle;
        pages[i].setRotation(degrees((existingRot + currentRotDeg) % 360));
      }
    }

    const saveBytes = await pdfDoc.save();
    const finalBlob = new Blob([saveBytes], { type: "application/pdf" });

    setOriginalSize(f.size);
    setNewSize(saveBytes.length);
    setPageCountOutput(pages.length);
    setOutputBlob(finalBlob);
    setOutputFileName(`rotated_aligned_${f.name}`);
    setStage(3);
  };

  // 7. COMPRESS ENGINE — real canvas-based image re-sampling for actual size reduction
  const doCompressPDF = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("No PDF loaded");

    // Quality settings per mode
    const scale = compressionMode === "extreme" ? 0.8 : 1.2;
    const jpegQuality = compressionMode === "extreme" ? 0.45 : 0.72;

    // Render each page to canvas then re-encode as JPEG to genuinely reduce size
<<<<<<< HEAD
    // Worker source is set at module level via the ?url import.
    // IMPORTANT: Copy bytes so pdf.js doesn't detach the underlying ArrayBuffer
    const bytesCopy = new Uint8Array(f.pdfBytes);
    const loadingTask = pdfjsLib.getDocument({ data: bytesCopy });
=======
    const loadingTask = pdfjsLib.getDocument({ data: f.pdfBytes, password: password || undefined });
>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
    const pdfJsDoc = await loadingTask.promise;
    const numPages = pdfJsDoc.numPages;

    // We build the jsPDF doc page-by-page, matching each source page's orientation
    let compressedDoc: InstanceType<typeof jsPDF> | null = null;

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfJsDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      const imgData = canvas.toDataURL("image/jpeg", jpegQuality);

      const isLandscape = viewport.width > viewport.height;
      const pageFormat: [number, number] = [viewport.width, viewport.height];

      if (i === 1) {
        // Create the jsPDF doc with the FIRST page's actual dimensions
        compressedDoc = new jsPDF({
          orientation: isLandscape ? "landscape" : "portrait",
          unit: "pt",
          format: pageFormat,
        });
      } else {
        compressedDoc!.addPage(pageFormat, isLandscape ? "landscape" : "portrait");
      }
      const pw = compressedDoc!.internal.pageSize.getWidth();
      const ph = compressedDoc!.internal.pageSize.getHeight();
      compressedDoc!.addImage(imgData, "JPEG", 0, 0, pw, ph);
    }

    if (!compressedDoc) throw new Error("PDF has no pages to compress.");

    const outBuffer = compressedDoc.output("arraybuffer");
    const outBytes = new Uint8Array(outBuffer);
    const finalBlob = new Blob([outBytes], { type: "application/pdf" });

    setOriginalSize(f.size);
    setNewSize(outBytes.length);
    setPageCountOutput(numPages);
    setOutputBlob(finalBlob);
    setOutputFileName(`compressed_${f.name}`);
    setStage(3);
  };

  // 8. PROTECT ENGINE
  // Sends the PDF to the server-side /api/protect-pdf endpoint which uses
  // qpdf-WASM for real AES-256 encryption. No client-side WASM overhead.
  // The server returns the encrypted PDF as a binary stream.
  const doProtectPDF = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("No PDF loaded");

    const capturedPassword = passwordRef.current.trim();
    const capturedExisting = existingPasswordRef.current.trim();

    if (!capturedPassword) {
      throw new Error("Password encryption key has not been entered.");
    }
<<<<<<< HEAD
    if (password.trim().length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const capturedPassword = passwordRef.current;
    const capturedConfirm = confirmPasswordRef.current;

    if (capturedConfirm !== capturedPassword) {
      throw new Error("Passwords do not match. Please re-enter and confirm your password.");
    }

    // Build multipart form data
    const formData = new FormData();
    const pdfBlob = new Blob([f.pdfBytes], { type: "application/pdf" });
    formData.append("file", pdfBlob, f.name);
    formData.append("password", capturedPassword);
=======
>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e

    const response = await fetch("/api/protect-pdf", {
      method: "POST",
      body: formData,
    });

<<<<<<< HEAD
    if (!response.ok) {
      let errMsg = "Encryption failed on the server.";
=======
    // If PDF is already encrypted, decrypt it first so we can re-encrypt with new password
    const encInfo = await checkIsEncrypted(workingBytes);
    console.log("[Protect] PDF already encrypted:", encInfo.encrypted);

    if (encInfo.encrypted) {
      if (!capturedExisting) {
        throw new Error(
          "This PDF is already password-protected. Enter its current password in the \"Existing password\" field."
        );
      }
>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
      try {
        const errBody = await response.json();
        errMsg = errBody.error || errMsg;
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }

<<<<<<< HEAD
    const encryptedArrayBuffer = await response.arrayBuffer();
    const encryptedBytes = new Uint8Array(encryptedArrayBuffer);
=======
    // Encrypt with the new password (AES-256 standard)
    const ownerPassword = `${capturedPassword}_owner_${Date.now()}`;
    console.log("[Protect] Encrypting with new password...");
    const encryptedBytes = await encryptPDF(workingBytes, capturedPassword, { ownerPassword });
    console.log("[Protect] Encryption done. Output size:", encryptedBytes.length);

>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
    const finalBlob = new Blob([encryptedBytes], { type: "application/pdf" });

    // Get page count from original (unencrypted) bytes via pdf-lib
    let pageCount = 0;
    try {
      const tempDoc = await PDFDocument.load(f.pdfBytes);
      pageCount = tempDoc.getPageCount();
    } catch { pageCount = 1; }

    setOriginalSize(f.size);
    setNewSize(encryptedBytes.length);
    setPageCountOutput(pageCount);
    setOutputBlob(finalBlob);
    setOutputFileName(`protected_${f.name}`);
    setStage(3);
  };



  // 9. UNLOCK ENGINE
  // Sends the encrypted PDF to the server-side /api/unlock-pdf endpoint which uses
  // qpdf-WASM to decrypt and return the raw binary. No client-side WASM overhead.
  const doUnlockPDF = async () => {
    const f = files[0];
    if (!f || !f.pdfBytes) throw new Error("No PDF loaded.");

    const capturedPw = passwordRef.current.trim();
    console.log("[Unlock] password length:", capturedPw.length);

    if (!capturedPw) {
      throw new Error("Please enter the PDF password to unlock it.");
    }

    // Check if it's actually encrypted
    const encInfo = await checkIsEncrypted(f.pdfBytes);
    console.log("[Unlock] Is encrypted:", encInfo.encrypted);
    if (!encInfo.encrypted) {
      throw new Error("This PDF is not password-protected — no unlock needed.");
    }

    // Build multipart form data
    const formData = new FormData();
    const pdfBlob = new Blob([f.pdfBytes], { type: "application/pdf" });
    formData.append("file", pdfBlob, f.name);
    formData.append("password", capturedPw);

    const response = await fetch("/api/unlock-pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errMsg = "Failed to unlock the PDF. The password may be incorrect.";
      try {
        const errBody = await response.json();
        errMsg = errBody.error || errMsg;
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    const decryptedArrayBuffer = await response.arrayBuffer();
    const decryptedBytes = new Uint8Array(decryptedArrayBuffer);
    const finalBlob = new Blob([decryptedBytes], { type: "application/pdf" });

    // Get page count
    let pageCount = 0;
    try {
      const doc = await PDFDocument.load(decryptedBytes);
      pageCount = doc.getPageCount();
    } catch { pageCount = 1; }

    setOriginalSize(f.size);
    setNewSize(decryptedBytes.length);
    setPageCountOutput(pageCount);
    setOutputBlob(finalBlob);
    setOutputFileName(`unlocked_${f.name}`);
    setStage(3);
  };

  // Download Trigger helper
  const handleDownloadFile = () => {
    if (!outputBlob) return;
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(outputBlob);
    link.href = objectUrl;
    link.download = outputFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  // Format File Size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Saved percentage metric
  const getPercentageSaved = () => {
    if (originalSize <= newSize) return 0;
    return Math.round(((originalSize - newSize) / originalSize) * 100);
  };

  // ── Markdown-to-JSX simple renderer ────────────────────────────────────
  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      // H2 headings
      if (line.startsWith("## ")) {
        return (
          <h3 key={i} className="text-sm font-bold text-neutral-900 mt-5 mb-2 flex items-center gap-1.5">
            {line.replace("## ", "")}
          </h3>
        );
      }
      // HR
      if (line.trim() === "---") {
        return <hr key={i} className="border-neutral-200 my-3" />;
      }
      // Bullet points
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const content = line.replace(/^[-*] /, "");
        return (
          <div key={i} className="flex items-start gap-2 text-xs text-neutral-600 leading-relaxed py-0.5">
            <span className="text-neutral-400 shrink-0 mt-0.5">•</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
          </div>
        );
      }
      // Bold key-value lines
      if (line.includes("**")) {
        return (
          <p key={i} className="text-xs text-neutral-600 leading-relaxed py-0.5"
            dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}
          />
        );
      }
      // Regular paragraph
      if (line.trim()) {
        return <p key={i} className="text-xs text-neutral-600 leading-relaxed py-0.5">{line}</p>;
      }
      return null;
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto" id="workspace_root_element">
      {/* Three-Tier Workspace Container */}
      <div className="glass-panel border-minimal rounded-2xl overflow-hidden transition-all duration-300">
        
        {/* Workspace Toolbar Header */}
        <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-neutral-100 rounded-lg text-neutral-600 block">
              {tool.slug === "merge-pdf" && <Layers size={18} />}
              {tool.slug === "split-pdf" && <Scissors size={18} />}
              {tool.slug === "jpg-to-pdf" && <FileImage size={18} />}
              {tool.slug === "pdf-to-jpg" && <FileText size={18} />}
              {tool.slug === "delete-pdf-pages" && <Trash2 size={18} />}
              {tool.slug === "rotate-pdf" && <RotateCw size={18} />}
              {tool.slug === "compress-pdf" && <Minimize2 size={18} />}
              {tool.slug === "protect-pdf" && <Shield size={18} />}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                {tool.name} <span className="text-xs font-normal text-neutral-500 bg-white border border-neutral-200 tracking-wider uppercase px-2 py-0.5 rounded-full">Client Processing</span>
              </h2>
              <p className="text-xs text-neutral-500">{tool.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-400">Attempts Today: {usageCount}/3</span>
            {files.length > 0 && stage === 1 && (
              <button 
                onClick={resetStates}
                className="text-xs font-medium text-red-500 hover:text-red-600 border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white shadow-2xs hover:shadow-xs transition"
                id="reset_workspace_btn_id"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* WORKSPACE BODY - Multi Stage */}
        <div className="p-6">
          
          {/* Stage 1: Active Setup / Dropzone */}
          {stage === 1 && (
            <div>
              {["pdf-to-word", "word-to-pdf", "edit-pdf", "sign-pdf"].includes(tool.slug) ? (
                // COMING SOON WORKSPACE
                <div className="flex flex-col items-center justify-center text-center py-12 px-6 max-w-md mx-auto space-y-6">
                  <div className="w-16 h-16 bg-neutral-100 border border-neutral-200 rounded-full flex items-center justify-center text-neutral-500">
                    <Sparkles size={28} className="text-neutral-500 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900">{tool.name}</h2>
                    <p className="text-xs text-neutral-400 mt-2 tracking-wide uppercase font-mono bg-neutral-100 px-3 py-1 rounded-full inline-block">Coming Soon</p>
                    <p className="text-sm text-neutral-500 mt-4 leading-relaxed">
                      We are currently developing our new high-speed, local browser engine for <strong>{tool.name}</strong>. This feature will be available in the upcoming update.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      window.history.pushState(null, "", "/");
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium px-6 py-2 rounded-xl text-sm transition shadow-sm cursor-pointer"
                  >
                    Go Back to Dashboard
                  </button>
                </div>
              ) : files.length === 0 ? (
                // DROPZONE COMPONENT
                <div className="flex flex-col items-center gap-6 w-full p-4">
                  <div className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-2">Process {tool.name}</h1>
                    <p className="text-neutral-500 text-sm max-w-md mx-auto">{tool.description}</p>
                  </div>
                  
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={triggerUploadClick}
                    className={`w-full dropzone-dashed h-64 flex flex-col items-center justify-center cursor-pointer gap-4 ${
                      dragActive ? "border-neutral-950 bg-neutral-50/50" : ""
                    }`}
                    id="dropzone_trigger_box"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden" 
                      multiple={tool.slug === "merge-pdf" || tool.slug === "jpg-to-pdf"}
                      accept={tool.slug === "jpg-to-pdf" ? "image/jpeg,image/jpg,image/png" : "application/pdf"}
                    />
                    <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center border border-neutral-100/85">
                      <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-lg text-neutral-900">Drag & drop files here</p>
                      <p className="text-sm text-neutral-400">or click to browse from device</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 w-full justify-center">
                    <span className="stat-badge">Max file size: 500MB</span>
                    <span className="stat-badge">End-to-End Encrypted</span>
                    <span className="stat-badge">Zero Server Load</span>
                  </div>

                  {dragError && (
                    <div className="text-xs font-semibold text-red-500 flex items-center justify-center gap-2 mt-2" id="drag_error_alert">
                      <AlertTriangle size={14} /> {dragError}
                    </div>
                  )}
                </div>
              ) : (
                // ACTIVE WORKSPACE INTERACTION INTERFACES BASED ON SLUG
                <div>
                  {isEncrypted && !["protect-pdf", "unlock-pdf"].includes(tool.slug) ? (
                    <div className="max-w-md mx-auto p-6 bg-white border border-neutral-200 rounded-xl space-y-4 shadow-xs text-center my-4" id="global_auth_encryption_block">
                      <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto text-amber-600">
                        <Lock size={22} className="animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-neutral-900">Document Password Protected</h4>
                        <p className="text-xs text-neutral-500 mt-1 font-sans">This document is locked with standard security schemas. Enter credentials to decode previews.</p>
                      </div>
                      <div className="space-y-3">
                        <input 
                          type="password"
                          value={password}
                          onChange={(e) => { passwordRef.current = e.target.value; setPassword(e.target.value); }}
                          placeholder="Password key..."
                          className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 font-mono text-center focus:outline-none focus:border-black"
                          id="encrypted_password_verify"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              testUnlockAndGeneratePreviews();
                            }
                          }}
                        />
                        <button 
                          onClick={testUnlockAndGeneratePreviews}
                          className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          Check Password <ArrowRight size={13} />
                        </button>
                        {dragError && (
                          <p className="text-[10px] text-red-500 font-semibold text-center mt-1 font-sans">{dragError}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* TOOL SPECIFIC SETTINGS DRAWER & TOOL CONTROLS */}
                      <div className="mb-6 p-4 rounded-xl bg-neutral-50 border border-neutral-200/60">
                    
                    {/* MERGE PDF FILES LIST CONTROLLER */}
                    {tool.slug === "merge-pdf" && (
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-neutral-200/50 pb-2">
                          <label className="text-xs font-semibold text-neutral-800 tracking-wide uppercase">File Merge Queue</label>
                          <button 
                            onClick={triggerUploadClick}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:underline"
                          >
                            <Plus size={14} /> Add More Files
                          </button>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {files.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
                              <div className="flex items-center gap-3 truncate">
                                <span className="font-mono text-[10px] text-neutral-400 w-4">{idx + 1}</span>
                                <FileText size={16} className="text-neutral-500 shrink-0" />
                                <div className="truncate">
                                  <p className="text-xs font-medium text-neutral-800 truncate">{file.name}</p>
                                  <p className="text-[10px] text-neutral-400 font-mono">{formatBytes(file.size)} • {file.pageCount} pages</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1shrink-0">
                                <button 
                                  onClick={() => moveFile(idx, "up")} 
                                  disabled={idx === 0}
                                  className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none"
                                >
                                  ▲
                                </button>
                                <button 
                                  onClick={() => moveFile(idx, "down")} 
                                  disabled={idx === files.length - 1}
                                  className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none"
                                >
                                  ▼
                                </button>
                                <button 
                                  onClick={() => removeFile(idx)} 
                                  className="p-1 text-neutral-400 hover:text-red-500 ml-2"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SPLIT PDF CONTROLS */}
                    {tool.slug === "split-pdf" && (
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 pb-2 border-b border-neutral-200/50 gap-2">
                          <div>
                            <label className="text-xs font-semibold text-neutral-800 tracking-wide uppercase">Select Pages to Split</label>
                            <p className="text-[10px] text-neutral-500">Each selected page will be exported as a standalone PDF inside your downloaded ZIP package.</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPagesToSplit(Array.from({ length: singleFileTotalPages }, (_, i) => i))}
                              className="text-[10px] font-semibold text-neutral-600 hover:text-black bg-white border border-neutral-200 px-2 py-1 rounded shadow-2xs cursor-pointer"
                            >
                              Select All
                            </button>
                            <button
                              onClick={() => setPagesToSplit([])}
                              className="text-[10px] font-semibold text-neutral-600 hover:text-black bg-white border border-neutral-200 px-2 py-1 rounded shadow-2xs cursor-pointer"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        {isGeneratingPreviews && pdfPreviews.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-neutral-400 gap-2">
                            <RefreshCw size={24} className="animate-spin text-neutral-600" />
                            <span className="text-xs font-mono">Rasterizing document page templates...</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-56 overflow-y-auto p-1">
                            {Array.from({ length: singleFileTotalPages }).map((_, pageIdx) => {
                              const isSelected = pagesToSplit.includes(pageIdx);
                              return (
                                <button 
                                  key={pageIdx}
                                  onClick={() => togglePageSplit(pageIdx)}
                                  className={`relative aspect-[3/4] p-2 bg-white rounded-lg border-2 text-center flex flex-col justify-between transition-all select-none cursor-pointer ${
                                    isSelected 
                                      ? "border-neutral-900 shadow-xs ring-1 ring-neutral-900" 
                                      : "border-neutral-200 hover:border-neutral-400 opacity-60"
                                  }`}
                                >
                                  {isSelected && (
                                    <div className="absolute top-2 right-2 w-4 h-4 bg-black rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-2xs border border-white">
                                      ✓
                                    </div>
                                  )}
                                  <div className="text-[10px] font-semibold text-neutral-400">PAGE {pageIdx + 1}</div>
                                  <div className="relative w-full h-16 overflow-hidden flex items-center justify-center border border-neutral-100 rounded bg-neutral-50 mb-1">
                                    {pdfPreviews[pageIdx] ? (
                                      <img src={pdfPreviews[pageIdx]} className="h-full w-auto object-contain pointer-events-none" alt="" referrerPolicy="no-referrer" />
                                    ) : (
                                      <FileText size={18} className="text-neutral-400 animate-pulse" />
                                    )}
                                  </div>
                                  <div className="text-[9px] font-medium text-neutral-600">
                                    {isSelected ? "Staged for Split" : "Excluded"}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* JPG TO PDF GALLERY LIST CONTROLLER */}
                    {tool.slug === "jpg-to-pdf" && (
                      <div>
                        <div className="flex items-center justify-between mb-3 border-b border-neutral-200/50 pb-2">
                          <label className="text-xs font-semibold text-neutral-800 tracking-wide uppercase">Image Sequence Queue</label>
                          <button 
                            onClick={triggerUploadClick}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:underline"
                          >
                            <Plus size={14} /> Add More Images
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-h-64 overflow-y-auto p-1">
                          {files.map((file, idx) => (
                            <div key={idx} className="relative group bg-white border border-neutral-200 rounded-lg p-2 flex flex-col items-center">
                              {file.dataUrl ? (
                                <img src={file.dataUrl} className="h-20 w-auto object-contain mb-2 rounded" alt={file.name} />
                              ) : (
                                <div className="h-20 w-full flex items-center justify-center bg-neutral-100 rounded mb-2 text-neutral-400"><FileImage size={24} /></div>
                              )}
                              <p className="text-[10px] font-medium text-neutral-700 truncate w-full text-center">{file.name}</p>
                              
                              <div className="absolute top-1.5 right-1.5 flex gap-1 bg-white/95 border border-neutral-200 rounded shadow-2xs px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => moveFile(idx, "up")}
                                  disabled={idx === 0}
                                  className="text-[9px] font-bold text-neutral-500 hover:text-black disabled:opacity-20"
                                >
                                  ◀
                                </button>
                                <button 
                                  onClick={() => moveFile(idx, "down")}
                                  disabled={idx === files.length - 1}
                                  className="text-[9px] font-bold text-neutral-500 hover:text-black disabled:opacity-20"
                                >
                                  ▶
                                </button>
                                <button 
                                  onClick={() => removeFile(idx)}
                                  className="text-[9px] text-red-500 hover:text-red-700 ml-1.5"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PDF TO JPG CONTROLS */}
                    {tool.slug === "pdf-to-jpg" && (
                      <div>
                        <label className="block text-xs font-semibold text-neutral-800 tracking-wide uppercase mb-2">Convert Pages To JPG Configuration</label>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 py-1">
                              <FileText size={16} className="text-neutral-600" />
                              <span className="text-xs font-semibold text-neutral-800 truncate max-w-sm">{files[0].name}</span>
                              <span className="text-xs text-neutral-400">({singleFileTotalPages} pages loaded)</span>
                            </div>
                            <p className="text-[10px] text-neutral-500">Each standalone slide will render cleanly inside the ZIP package download.</p>
                          </div>
                          <span className="text-xs bg-white border border-neutral-200 text-neutral-700 font-bold rounded-lg px-3 py-1.5 shadow-2xs">
                            Format: JPEG Output (Standard RGB, Optimized Web Assets)
                          </span>
                        </div>

                        {/* visual thumbnails display */}
                        {pdfPreviews.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-neutral-200/50">
                            <span className="text-[10px] tracking-wide text-neutral-400 font-bold uppercase block mb-2">Preview Slides</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-56 overflow-y-auto p-1">
                              {pdfPreviews.map((preview, pageIdx) => (
                                <div key={pageIdx} className="aspect-[3/4] p-1.5 bg-white rounded-lg border border-neutral-200 shadow-2xs relative flex flex-col items-center justify-end">
                                  <div className="absolute top-1 left-1.5 text-[8.5px] font-mono text-neutral-400">SLIDE {pageIdx + 1}</div>
                                  <img src={preview} className="max-h-full max-w-full object-contain pointer-events-none mb-1 rounded-sm border border-neutral-100" alt="" referrerPolicy="no-referrer" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* VISUAL PAGE REMOVER (DELETE PDF PAGES) */}
                    {tool.slug === "delete-pdf-pages" && (
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-200/50">
                          <div>
                            <label className="text-xs font-semibold text-neutral-800 tracking-wide uppercase">Interactive Page-Culling Canvas</label>
                            <p className="text-[10px] text-neutral-500">Click on any page thumbnail to mark it for deletion.</p>
                          </div>
                          <div className="text-[10px] font-mono text-neutral-600 bg-white border border-neutral-200 px-2 py-1 rounded">
                            Remaining: {singleFileTotalPages - pagesToDelete.length} of {singleFileTotalPages} pages
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-56 overflow-y-auto p-1">
                          {Array.from({ length: singleFileTotalPages }).map((_, pageIdx) => {
                            const isDeleted = pagesToDelete.includes(pageIdx);
                            return (
                              <button 
                                key={pageIdx}
                                onClick={() => togglePageDeletion(pageIdx)}
                                className={`relative aspect-[3/4] p-2 bg-white rounded-lg border-2 text-center flex flex-col justify-between transition-all cursor-pointer ${
                                  isDeleted 
                                    ? "border-red-400 opacity-50 bg-red-50/20 shadow-inner" 
                                    : "border-neutral-200 hover:border-neutral-800 hover:shadow-xs shadow-2xs"
                                }`}
                              >
                                {isDeleted && (
                                  <div className="absolute inset-0 bg-red-100/10 flex items-center justify-center p-1 font-semibold text-red-500 text-xs select-none">
                                    <Trash2 size={22} className="opacity-90" />
                                  </div>
                                )}
                                <div className="text-[10px] font-semibold text-neutral-400">PAGE {pageIdx + 1}</div>
                                <div className="relative w-full h-16 overflow-hidden flex items-center justify-center border border-neutral-100 rounded bg-neutral-50 my-1">
                                  {pdfPreviews[pageIdx] ? (
                                    <img src={pdfPreviews[pageIdx]} className="h-full w-auto object-contain pointer-events-none" alt="" referrerPolicy="no-referrer" />
                                  ) : (
                                    <FileText size={18} className="text-neutral-400" />
                                  )}
                                </div>
                                <div className="text-[10px] text-neutral-500 font-mono">
                                  {isDeleted ? "Status: REMOVE" : "Status: KEEP"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* DYNAMIC ROTATE PDF CONTROLS */}
                    {tool.slug === "rotate-pdf" && (
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-200/50">
                          <div>
                            <label className="text-xs font-semibold text-neutral-800 tracking-wide uppercase">Set Page Orientation</label>
                            <p className="text-[10px] text-neutral-500">Tap individual slides to rotate them, or apply batch changes instantly.</p>
                          </div>
                          <button 
                            onClick={rotateAllPages}
                            className="text-[10px] border border-neutral-200 bg-white rounded-lg px-2.5 py-1 text-neutral-700 hover:bg-neutral-50 shadow-2xs cursor-pointer font-bold"
                          >
                            Rotate All Pages 90° Clockwise
                          </button>
                        </div>

                        {isGeneratingPreviews && pdfPreviews.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-neutral-400 gap-2">
                            <RefreshCw size={24} className="animate-spin text-neutral-600" />
                            <span className="text-xs font-mono">Rasterizing document page templates...</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-56 overflow-y-auto p-1">
                            {Array.from({ length: singleFileTotalPages }).map((_, pageIdx) => {
                              const rotationDeg = pageRotations[pageIdx] || 0;
                              return (
                                <button 
                                  key={pageIdx}
                                  onClick={() => rotatePage(pageIdx)}
                                  className="relative aspect-[3/4] p-2.5 bg-white rounded-lg border border-neutral-200 hover:border-neutral-800 shadow-2xs hover:shadow-xs active:scale-[0.98] transition flex flex-col justify-between items-center group cursor-pointer"
                                >
                                  <div className="text-[10px] font-bold text-neutral-400">PAGE {pageIdx + 1}</div>
                                  
                                  {/* Rotate Animation representation with actual PDF rendering previews! */}
                                  <div className="relative w-full h-20 overflow-hidden flex items-center justify-center border border-neutral-200 rounded shadow-2xs bg-neutral-50 py-1">
                                    {pdfPreviews[pageIdx] ? (
                                      <img 
                                        src={pdfPreviews[pageIdx]} 
                                        style={{ transform: `rotate(${rotationDeg}deg)` }} 
                                        className="max-h-full max-w-full object-contain transition-transform duration-200 pointer-events-none rounded" 
                                        alt={`Preview of Page ${pageIdx + 1}`}
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div style={{ transform: `rotate(${rotationDeg}deg)` }} className="transition-transform duration-200">
                                        <RotateCw size={18} className="text-neutral-400" />
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-[9px] font-mono text-neutral-500 mt-1">
                                    {rotationDeg}° Rotated
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* COMPRESS PDF RADIOS */}
                    {tool.slug === "compress-pdf" && (
                      <div>
                        <label className="block text-xs font-semibold text-neutral-800 tracking-wide uppercase mb-2">Select Compression Ratio Preset</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <button
                            onClick={() => setCompressionMode("balanced")}
                            className={`p-4 rounded-xl text-left border transition-all ${
                              compressionMode === "balanced"
                                ? "bg-white border-neutral-900 shadow-xs ring-1 ring-neutral-900"
                                : "bg-white border-neutral-200 hover:border-neutral-400"
                            }`}
                          >
                            <h4 className="text-xs font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                              Balanced Compression <span className="text-[9px] bg-neutral-100 text-neutral-600 border border-neutral-200 font-mono px-1.5 py-0.5 rounded">Standard</span>
                            </h4>
                            <p className="text-[11px] text-neutral-500">Perfect ratio between high display and typography parameters, saving ~35% space.</p>
                          </button>

                          <button
                            onClick={() => setCompressionMode("extreme")}
                            className={`p-4 rounded-xl text-left border transition-all ${
                              compressionMode === "extreme"
                                ? "bg-white border-neutral-900 shadow-xs ring-1 ring-neutral-900"
                                : "bg-white border-neutral-200 hover:border-neutral-400"
                            }`}
                          >
                            <h4 className="text-xs font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                              Extreme Compression <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 font-mono px-1.5 py-0.5 rounded">Best Saving</span>
                            </h4>
                            <p className="text-[11px] text-neutral-500">Heavy scaling optimization on layout vectors and resolution densities, saving ~60% space.</p>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* PROTECT PDF — Password & Confirm Password (Lovable Design) */}
                    {tool.slug === "protect-pdf" && (
<<<<<<< HEAD
                      <div className="space-y-4">
                        {/* File pill */}
                        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <FileText size={18} className="text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-neutral-900 truncate">{files[0].name}</p>
                            <p className="text-[11px] text-neutral-400">{(files[0].size / 1024).toFixed(0)} KB · PDF</p>
                          </div>
                          <button
                            onClick={resetStates}
                            className="text-xs text-neutral-500 hover:text-neutral-800 flex items-center gap-1 transition-colors"
                          >
                            <X size={13} /> Change
                          </button>
                        </div>

                        {/* Password field */}
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="password_input_protect">Password</label>
                          <div className="relative">
                            <input
                              id="password_input_protect"
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => { setPassword(e.target.value); passwordRef.current = e.target.value; }}
                              placeholder="••••••••"
                              className="w-full text-sm bg-white border border-neutral-200 rounded-xl px-4 py-3 pr-11 focus:outline-none focus:border-neutral-800 focus:ring-2 focus:ring-neutral-100 transition-all placeholder:text-neutral-300"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
                              tabIndex={-1}
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              )}
                            </button>
=======
                      <div>
                        <label className="block text-xs font-semibold text-neutral-800 tracking-wide uppercase mb-2">Configure File Passkey Encryption</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-neutral-500 block mb-1">Target protect file:</span>
                            <div className="flex items-center gap-2 py-1">
                              <FileText size={16} className="text-neutral-600" />
                              <span className="text-xs font-semibold text-neutral-800 truncate max-w-xs">{files[0].name}</span>
                            </div>
                            <p className="text-[10px] text-neutral-400 mt-1">This uses localized stream encryption to scramble elements securely.</p>
                            {pdfAlreadyEncrypted && (
                              <p className="text-[10px] text-amber-700 mt-2 flex items-center gap-1 font-sans">
                                <AlertTriangle size={11} /> This file is already protected. Enter its current password before setting a new one.
                              </p>
                            )}
                          </div>
                          <div className="space-y-3">
                            {pdfAlreadyEncrypted && (
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1 font-medium font-sans">Existing password:</label>
                                <div className="relative">
                                  <input
                                    type="password"
                                    value={existingPassword}
                                    onChange={(e) => {
                                      existingPasswordRef.current = e.target.value;
                                      setExistingPassword(e.target.value);
                                    }}
                                    placeholder="Current document password..."
                                    className="w-full text-xs bg-white border border-neutral-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-neutral-900 font-mono"
                                    id="password_input_protect_existing"
                                  />
                                  <Lock size={14} className="absolute left-3 top-2.5 text-neutral-400" />
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="block text-xs text-neutral-500 mb-1 font-medium font-sans">New password:</label>
                              <div className="relative">
                                <input 
                                  type="password" 
                                  value={password}
                                  onChange={(e) => {
                                    passwordRef.current = e.target.value;
                                    setPassword(e.target.value);
                                  }}
                                  placeholder="Enter secure lock key..."
                                  className="w-full text-xs bg-white border border-neutral-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-neutral-900 font-mono"
                                  id="password_input_protect"
                                />
                                <Lock size={14} className="absolute left-3 top-2.5 text-neutral-400" />
                              </div>
                              <p className="text-[9px] text-amber-600 mt-1.5 flex items-center gap-1 font-sans">
                                <AlertTriangle size={11} /> Keep a note of it. Passwords cannot be retrieved due to high-security offline design.
                              </p>
                            </div>
>>>>>>> 862fd0cf9e1a1b5175b23674a719bca2446e454e
                          </div>
                        </div>

                        {/* Confirm Password field */}
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1.5" htmlFor="confirm_password_input_protect">Confirm password</label>
                          <div className="relative">
                            <input
                              id="confirm_password_input_protect"
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => { setConfirmPassword(e.target.value); confirmPasswordRef.current = e.target.value; }}
                              placeholder="••••••••"
                              className={`w-full text-sm bg-white border rounded-xl px-4 py-3 pr-11 focus:outline-none focus:ring-2 transition-all placeholder:text-neutral-300 ${
                                confirmPassword.length > 0 && confirmPassword !== password
                                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                                  : "border-neutral-200 focus:border-neutral-800 focus:ring-neutral-100"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
                              tabIndex={-1}
                              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                            >
                              {showConfirmPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              )}
                            </button>
                          </div>
                          {confirmPassword.length > 0 && confirmPassword !== password && (
                            <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
                          )}
                        </div>

                        {/* Helper text */}
                        <p className="text-xs text-neutral-500">Use at least 8 characters. We never see your password.</p>
                      </div>
                    )}

                    {/* UNLOCK PDF KEYS ENTRY */}
                    {tool.slug === "unlock-pdf" && (
                      <div>
                        <label className="block text-xs font-semibold text-neutral-800 tracking-wide uppercase mb-2 font-mono">Create Unlocked Copy</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <span className="text-xs text-neutral-500 block mb-1">Target protected file:</span>
                            <div className="flex items-center gap-2 py-1">
                              <FileText size={16} className="text-neutral-600" />
                              <span className="text-xs font-semibold text-neutral-800 truncate max-w-xs">{files[0].name}</span>
                            </div>
                            <p className="text-[10px] text-neutral-400 mt-1 font-sans">Enter the password to create an unlocked copy that opens without prompts.</p>
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-500 mb-1 font-medium font-sans">Enter the document password:</label>
                            <div className="relative">
                              <input 
                                type="password" 
                                value={password}
                                onChange={(e) => {
                                  passwordRef.current = e.target.value;
                                  setPassword(e.target.value);
                                }}
                                placeholder="Decrypt password..."
                                className="w-full text-xs bg-white border border-neutral-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-neutral-900 font-mono"
                                id="password_input_unlock"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    executePDFAction();
                                  }
                                }}
                              />
                              <Lock size={14} className="absolute left-3 top-2.5 text-neutral-400" />
                            </div>
                            <p className="text-[9px] text-neutral-400 mt-1.5 font-sans">
                              The password is used locally to open the file and export a decrypted copy.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* EXECUTE COMPILATION BLOCK */}
                  {tool.slug === "protect-pdf" ? (
                    /* ── Lovable-style full-width Protect PDF CTA ── */
                    <div className="border-t border-neutral-100 pt-5">
                      <button
                        onClick={executePDFAction}
                        disabled={!password || password.length < 8 || confirmPassword !== password}
                        id="compile_pdf_btn_id"
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm transition-all
                          bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm
                          disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                          focus:outline-none focus:ring-2 focus:ring-neutral-800 focus:ring-offset-1"
                      >
                        <Shield size={16} />
                        Protect PDF
                      </button>
                    </div>
                  ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-neutral-100 pt-5">
                    {tool.slug === "merge-pdf" ? (
                      <span className="text-xs text-neutral-500 font-mono">
                        {files.length} documents staged for single compilation merging.
                      </span>
                    ) : tool.slug === "jpg-to-pdf" ? (
                      <span className="text-xs text-neutral-500 font-mono">
                        {files.length} images will be assembled in index sequence.
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500 font-mono">
                        Fully local, blazing high rendering speed. Zero network transmission.
                      </span>
                    )}

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button 
                        onClick={resetStates}
                        className="text-xs font-semibold text-neutral-600 hover:text-black border border-neutral-200 rounded-lg px-4 py-2 bg-white flex-1 sm:flex-none text-center"
                      >
                        Back
                      </button>
                      <button 
                        onClick={executePDFAction}
                        className="text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 rounded-lg px-6 py-2 shadow-xs hover:shadow-sm tracking-wide shrink-0 font-mono flex-1 sm:flex-none text-center flex items-center justify-center gap-1.5 cursor-pointer"
                        id="compile_pdf_btn_id"
                      >
                        {tool.slug === "unlock-pdf"
                          ? "Create Unlocked Copy"
                          : "Compile & Export"}{" "}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                  )}


                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* Stage 2: Processing Loader Screen */}
          {stage === 2 && (
            <div className="py-12 text-center" id="processing_loader_wrapper">
              <div className="flex items-center justify-center mb-6">
                <RefreshCw size={36} className="text-neutral-900 animate-spin" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-950 mb-2">Executing Local High-Speed Task</h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">{processingMessage}</p>
              <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] font-mono bg-neutral-50 border border-neutral-200 inline-flex mx-auto px-2.5 py-1 rounded-full text-neutral-500">
                <ActivityDot /> Processing Document • Instantly Ready
              </div>
            </div>
          )}

          {/* Stage 3: Success & Download Presentation Panel */}
          {stage === 3 && (
            <div className="py-6 text-center" id="success_stage_wrapper">
              
              <div className="inline-flex items-center justify-center p-3 bg-neutral-50 border border-neutral-200 rounded-full mb-4 text-emerald-500">
                <CheckCircle size={32} />
              </div>
              
              <h3 className="text-lg font-bold text-neutral-950 mb-1">
                {tool.slug === "protect-pdf"
                  ? "Protected Copy Created Successfully!"
                  : tool.slug === "unlock-pdf"
                    ? "Unlocked Copy Created Successfully!"
                    : "Document Compiled Successfully!"}
              </h3>
              <p className="text-xs text-neutral-500 mb-6">
                {tool.slug === "protect-pdf"
                  ? "Your password-protected PDF copy has been generated and is ready for download."
                  : tool.slug === "unlock-pdf"
                    ? "Your decrypted PDF copy has been generated and is ready for download."
                    : "Your modified document has been generated and is ready for download."}
              </p>

              {/* STATS COMPARISON MATRIX */}
              <div className="max-w-md mx-auto grid grid-cols-3 gap-3 p-4 bg-neutral-50 border border-neutral-200 rounded-xl mb-8">
                
                <div className="text-center p-2 border-r border-neutral-200">
                  <span className="text-[10px] font-semibold text-neutral-400 tracking-wider uppercase block mb-1">Original Size</span>
                  <span className="text-xs font-semibold text-neutral-800 font-mono">{formatBytes(originalSize)}</span>
                </div>

                <div className="text-center p-2 border-r border-neutral-200">
                  <span className="text-[10px] font-semibold text-neutral-400 tracking-wider uppercase block mb-1">
                    {tool.slug === "protect-pdf"
                      ? "Protected Output"
                      : tool.slug === "unlock-pdf"
                        ? "Unlocked Output"
                        : "Compiled Output"}
                  </span>
                  <span className="text-xs font-bold text-neutral-950 font-mono">{formatBytes(newSize)}</span>
                </div>

                <div className="text-center p-2 flex flex-col justify-center items-center">
                  <span className="text-[10px] font-semibold text-neutral-400 tracking-wider uppercase block mb-1">Disk Saved</span>
                  {originalSize > newSize ? (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 font-mono">
                      -{getPercentageSaved()}%
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5 font-mono">
                      Optimal
                    </span>
                  )}
                </div>

              </div>

              {/* ACTION LINKS */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button 
                  onClick={resetStates}
                  className="w-full sm:w-auto text-xs font-semibold text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg px-5 py-2.5 bg-white shadow-2xs hover:shadow-xs transition font-mono"
                  id="process_another_btn"
                >
                  {tool.slug === "protect-pdf" || tool.slug === "unlock-pdf"
                    ? "Start Over"
                    : "Process Another File"}
                </button>
                
                <button 
                  onClick={handleDownloadFile}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-xs font-bold text-white bg-neutral-900 hover:bg-black rounded-lg px-8 py-2.5 shadow-sm hover:shadow-md transition font-mono cursor-pointer"
                  id="final_download_btn_id"
                >
                  <Download size={14} />
                  {tool.slug === "protect-pdf"
                    ? "Download Protected Copy"
                    : tool.slug === "unlock-pdf"
                      ? "Download Unlocked Copy"
                      : "Download Document"}
                </button>
              </div>

              {/* Trust Disclaimer */}
              <p className="text-[10px] text-neutral-400 mt-6 flex items-center justify-center gap-1 font-mono">
                <ShieldCheck size={12} className="text-emerald-500" /> Processing stays local in your browser until you download the file.
              </p>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}

// Subordinate visuals
function ActivityDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
    </span>
  );
}
