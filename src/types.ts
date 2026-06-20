/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToolDefinition {
  slug: string;
  name: string;
  description: string;
  iconName: string;
  steps: { title: string; desc: string }[];
  faqs: { q: string; a: string }[];
  seoText: string;
}

export interface PDFFileInfo {
  name: string;
  size: number;
  type: string;
  pageCount?: number;
  dataUrl?: string; // used for images sequence
  pdfBytes?: Uint8Array;
}

export interface ToolWorkspaceProps {
  tool: ToolDefinition;
  onLimitExceeded: () => void;
  usageCount: number;
  incrementUsage: () => Promise<boolean>;
  key?: string;
}

export interface PaymentPlan {
  id: "starter" | "monthly" | "annual";
  name: string;
  price: number;
  period: string;
  popular?: boolean;
  originalPrice?: number;
  benefits: string[];
  description?: string;
  discount?: string;
}
