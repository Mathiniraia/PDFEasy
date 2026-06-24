import React, { useEffect } from "react";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsOfService() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const navigateHome = () => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="bg-neutral-50 border-b border-neutral-100 pt-16 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <button 
            onClick={navigateHome}
            className="flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-black transition-colors mb-10"
          >
            <ArrowLeft size={16} /> Back to Home
          </button>
          
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-white">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
                Terms of Service
              </h1>
              <p className="text-neutral-500 font-medium mt-1">Last Updated: June 24, 2026</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <article className="prose prose-lg prose-neutral max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600">
          
          <p className="lead text-xl text-neutral-600 mb-8">
            Please read these Terms of Service carefully before using the Trust My PDF website and services operated by Trust My PDF.
          </p>

          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using our services, you agree to be bound by these Terms. If you disagree with any part of the terms, then you may not access the service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Trust My PDF provides a suite of web-based utility tools for managing, editing, combining, and optimizing Portable Document Format (PDF) files. The core processing is performed entirely within your web browser, meaning your files are not transmitted to or stored on our servers.
          </p>

          <h2>3. Subscriptions and Payments</h2>
          <p>
            While certain features are available for free (subject to daily limits), advanced features and unlimited access require a "Pro" subscription.
          </p>
          <ul>
            <li><strong>Billing:</strong> You will be billed in advance on a recurring, periodic basis (such as monthly or annually), depending on the subscription plan you select.</li>
            <li><strong>Cancellations:</strong> You may cancel your subscription at any time. Your access will remain active until the end of your current billing cycle.</li>
            <li><strong>Refunds:</strong> Except when required by law, paid subscription fees are non-refundable. We encourage users to utilize the free tier to test the tools before purchasing a Pro plan.</li>
          </ul>

          <h2>4. Acceptable Use</h2>
          <p>
            You agree not to use Trust My PDF:
          </p>
          <ul>
            <li>In any way that violates any applicable national or international law or regulation.</li>
            <li>To attempt to bypass or reverse engineer the paywall, rate limits, or proprietary code.</li>
            <li>To engage in any automated use of the system, such as using scripts to send multiple requests beyond normal human usage, without prior written permission via API access.</li>
          </ul>

          <h2>5. Intellectual Property</h2>
          <p>
            The website and its original content, features, and functionality are and will remain the exclusive property of Trust My PDF and its licensors. Our branding, logos, and UI designs may not be used in connection with any product or service without the prior written consent of Trust My PDF.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            In no event shall Trust My PDF, nor its directors, employees, or partners, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
          </p>
          <p>
            Because we do not store your files, we are not liable for any data loss regarding your PDFs. Please ensure you maintain original copies of all documents you process.
          </p>

          <h2>7. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us:
          </p>
          <p>
            <strong>Email:</strong> trustmypdf@gmail.com
          </p>
        </article>
      </div>
    </div>
  );
}
