import React from 'react';
import { motion } from 'motion/react';
import { FileText, CheckCircle, AlertCircle, ChevronLeft } from 'lucide-react';

interface Props {
  onBack: () => void;
  t: any;
}

export const TermsOfService: React.FC<Props> = ({ onBack, t }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-fadeIn">
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
            <FileText size={40} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Agreement for Mnemonix App Usage</p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-accent">
              <CheckCircle size={24} />
              <h2 className="text-2xl font-black m-0">Acceptance of Terms</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              By using Mnemonix, you agree to abide by these terms. Our service is designed to help you master vocabulary through AI-generated mnemonics.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-accent">
              <AlertCircle size={24} />
              <h2 className="text-2xl font-black m-0">User Conduct</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Users are prohibited from attempting to scrape, reverse engineer, or abuse our AI services. Any automated misuse of the Gemini API through our platform will result in immediate termination of access.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Fair Use & Limitations</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Mnemonix provides a specialized toolset. While we strive for 100% uptime, service availability depends on third-party providers (Google Gemini, Supabase). We are not liable for temporary outages or AI-generated inaccuracies.
            </p>
          </section>

          <section className="pt-8 border-t border-gray-100 dark:border-slate-800 text-center">
            <p className="text-gray-400 text-sm italic">
              By continuing to use the app, you acknowledge that AI-generated content is for educational purposes only.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
