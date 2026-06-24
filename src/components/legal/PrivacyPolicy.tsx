import React, { useEffect } from "react";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
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
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
                Privacy Policy
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
            At Trust My PDF, your privacy is our absolute highest priority. We built this tool specifically to solve the massive security risks associated with traditional online PDF converters.
          </p>

          <h2>1. We Do Not Upload Your Files</h2>
          <p>
            Our core architecture is built entirely around client-side processing (using WebAssembly technologies). This means when you merge, split, or edit a PDF on our website, <strong>your files never leave your computer or browser.</strong> 
          </p>
          <p>
            We do not have access to your documents. We do not store your documents on our servers. The processing happens using your device's memory. Once you refresh the page, all file data is permanently erased from your browser memory.
          </p>

          <h2>2. Information We Collect</h2>
          <p>
            Because we do not handle your files, the data we collect is extremely minimal and standard for modern web applications:
          </p>
          <ul>
            <li><strong>Account Information:</strong> If you choose to sign up or purchase a Pro plan, we collect your email address and basic profile information via Google Authentication to manage your subscription.</li>
            <li><strong>Usage Analytics:</strong> We track anonymous, high-level metrics (e.g., how many times the "Merge" tool was used today) to help us improve the app. We use secure, privacy-respecting analytics tools that do not track individual users across the web.</li>
            <li><strong>Payment Information:</strong> All payments are processed securely through Razorpay. We do not store or process your credit card numbers on our servers.</li>
          </ul>

          <h2>3. Cookies and Local Storage</h2>
          <p>
            We use browser Local Storage and minimal cookies to remember your preferences (like staying logged in) and to enforce usage limits on the Free plan. You can clear these at any time via your browser settings.
          </p>

          <h2>4. Third-Party Services</h2>
          <p>
            We use a few trusted third-party services to operate the business:
          </p>
          <ul>
            <li><strong>Firebase:</strong> For authentication and secure user database management.</li>
            <li><strong>Razorpay:</strong> For secure payment processing.</li>
          </ul>
          <p>These services only receive the specific data necessary to perform their functions (e.g., Razorpay receives your email to send a receipt).</p>

          <h2>5. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or our data practices, please reach out directly:
          </p>
          <p>
            <strong>Email:</strong> trustmypdf@gmail.com
          </p>
        </article>
      </div>
    </div>
  );
}
