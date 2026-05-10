import React from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, Eye, FileText, ChevronLeft } from 'lucide-react';

interface Props {
  onBack: () => void;
  t: any;
}

export const PrivacyPolicy: React.FC<Props> = ({ onBack, t }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-fadeIn">
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="mb-8 flex items-center gap-2 text-gray-500 hover:text-accent transition-colors font-black uppercase tracking-widest text-xs"
      >
        <ChevronLeft size={20} />
        {t.back || 'Back'}
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-12">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-accent/10 rounded-3xl flex items-center justify-center text-accent mx-auto">
            <Shield size={40} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Last updated: May 2025</p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-accent transition-transform hover:translate-x-1">
              <Eye size={24} />
              <h2 className="text-2xl font-black m-0">Data Collection</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Mnemonix collects minimal data to provide a personalized learning experience. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-400">
              <li>Account information (Email, Username) provided via Google Auth or Supabase.</li>
              <li>Learning progress (Saved words, mastered items, and search history).</li>
              <li>Device identifiers solely for the purpose of ensuring service limits and security.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-accent transition-transform hover:translate-x-1">
              <Lock size={24} />
              <h2 className="text-2xl font-black m-0">Data Security</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We take the security of your data seriously. Your information is stored securely using Supabase (PostgreSQL) with industry-standard encryption. We never sell your personal data to third parties.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-accent transition-transform hover:translate-x-1">
              <FileText size={24} />
              <h2 className="text-2xl font-black m-0">Your Rights (GDPR/CCPA)</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Under relevant data protection laws, you have the right to access, rectify, or erase your personal data. You can delete your account and all associated learning data directly from the profile settings or by contacting our support team.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Cookies</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We use essential cookies to maintain your login session and store your UI preferences (like dark mode and language).
            </p>
          </section>

          <section className="pt-8 border-t border-gray-100 dark:border-slate-800 text-center">
            <p className="text-gray-400 text-sm italic">
              If you have any questions regarding this policy, please contact us at support@mnemonix.io
            </p>
          </section>Section Content
        </div>
      </div>
    </div>
  );
};
