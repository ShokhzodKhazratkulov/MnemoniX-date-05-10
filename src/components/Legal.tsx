
import React from 'react';
import { motion } from 'motion/react';
import { Shield, FileText, ChevronLeft, Lock, Globe, Mail } from 'lucide-react';
import { Language } from '../types';

interface LegalProps {
  type: 'privacy' | 'terms';
  language: Language;
  onBack: () => void;
}

export const Legal: React.FC<LegalProps> = ({ type, language, onBack }) => {
  const isUzbek = language === Language.UZBEK;

  const content = {
    privacy: {
      title: isUzbek ? "Maxfiylik Siyosati" : "Privacy Policy",
      lastUpdated: isUzbek ? "Oxirgi yangilanish: 2026-yil 5-may" : "Last updated: May 5, 2026",
      sections: [
        {
          title: isUzbek ? "1. Biz to'playdigan ma'lumotlar" : "1. Information We Collect",
          content: isUzbek 
            ? "MnemoniX xizmatlaridan foydalanganingizda biz quyidagi ma'lumotlarni to'plashimiz mumkin: elektron pochta manzili, ism-sharif, qurilma identifikatori va ilovadan foydalanish statistikasi."
            : "When you use MnemoniX, we may collect information such as your email address, full name, device identifier, and application usage statistics."
        },
        {
          title: isUzbek ? "2. Ma'lumotlardan foydalanish" : "2. How We Use Information",
          content: isUzbek
            ? "To'plangan ma'lumotlar xizmat sifatini yaxshilash, foydalanuvchi tajribasini shaxsiylashtirish va siz bilan bog'lanish (masalan, qo'llab-quvvatlash yoki yangilanishlar haqida xabar berish) uchun ishlatiladi."
            : "The collected information is used to improve service quality, personalize user experience, and communicate with you (e.g., for support or updates)."
        },
        {
          title: isUzbek ? "3. Ma'lumotlarni saqlash va himoya qilish" : "3. Data Storage and Protection",
          content: isUzbek
            ? "Sizning ma'lumotlaringiz xavfsiz serverlarda saqlanadi. Biz ularni ruxsatsiz kirishdan himoya qilish uchun zamonaviy xavfsizlik choralarini qo'llaymiz."
            : "Your data is stored on secure servers. We employ modern security measures to protect it from unauthorized access."
        },
        {
          title: isUzbek ? "4. Uchinchi shaxslar" : "4. Third Parties",
          content: isUzbek
            ? "Biz sizning shaxsiy ma'lumotlaringizni uchinchi shaxslarga sotmaymiz. Biroq, to'lov xizmatlari (masalan, Payme) kabi ishonchli hamkorlar bilan zarur ma'lumotlarni baham ko'rishimiz mumkin."
            : "We do not sell your personal data to third parties. However, we may share necessary data with trusted partners such as payment providers (e.g., Payme)."
        },
        {
          title: isUzbek ? "5. Sizning huquqlaringiz" : "5. Your Rights",
          content: isUzbek
            ? "Siz o'z ma'lumotlaringizni ko'rish, tahrirlash yoki o'chirishni talab qilish huquqiga egasiz. Bu borada hello@mnemonix.io manzili orqali bizga murojaat qilishingiz mumkin."
            : "You have the right to access, edit, or request the deletion of your data. You can contact us at hello@mnemonix.io regarding this."
        }
      ]
    },
    terms: {
      title: isUzbek ? "Foydalanish Shartlari" : "Terms of Service",
      lastUpdated: isUzbek ? "Oxirgi yangilanish: 2026-yil 5-may" : "Last updated: May 5, 2026",
      sections: [
        {
          title: isUzbek ? "1. Shartlarni qabul qilish" : "1. Acceptance of Terms",
          content: isUzbek
            ? "MnemoniX ilovasidan foydalanish orqali siz ushbu foydalanish shartlariga to'liq rozilik bildirasiz."
            : "By using the MnemoniX application, you fully agree to these terms of service."
        },
        {
          title: isUzbek ? "2. Xizmat tavsifi" : "2. Service Description",
          content: isUzbek
            ? "MnemoniX - bu mnemonika va sun'iy intellekt yordamida ingliz tilini o'rganish uchun mo'ljallangan platforma."
            : "MnemoniX is a platform designed for learning English using mnemonics and artificial intelligence."
        },
        {
          title: isUzbek ? "3. Obuna va to'lovlar" : "3. Subscriptions and Payments",
          content: isUzbek
            ? "Ilovaning ayrim funksiyalari pullik obuna talab qiladi. To'lovlar xavfsiz to'lov tizimlari orqali amalga oshiriladi va qaytarib berilmaydi (agar qonunda boshqacha tartib nazarda tutilmagan bo'lsa)."
            : "Certain features of the app require a paid subscription. Payments are processed through secure payment systems and are non-refundable (unless otherwise required by law)."
        },
        {
          title: isUzbek ? "4. Foydalanuvchi mas'uliyati" : "4. User Responsibility",
          content: isUzbek
            ? "Foydalanuvchilar ilovadan faqat qonuniy maqsadlarda foydalanishlari va intellektual mulk huquqlarini hurmat qilishlari shart."
            : "Users must use the app for lawful purposes only and respect intellectual property rights."
        },
        {
          title: isUzbek ? "5. Mas'uliyatni cheklash" : "5. Limitation of Liability",
          content: isUzbek
            ? "Biz xizmatning uzluksiz ishlashiga intilamiz, ammo texnik nosozliklar yoki ma'lumotlar yo'qolishi uchun javobgar emasmiz."
            : "We strive for continuous service operation but are not liable for technical failures or data loss."
        }
      ]
    }
  };

  const currentContent = type === 'privacy' ? content.privacy : content.terms;

  return (
    <div className="min-h-screen bg-neutral dark:bg-primary pt-20 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-gray-500 hover:text-accent transition-colors mb-8 group"
        >
          <div className="p-2 bg-white/50 dark:bg-white/5 rounded-xl group-hover:scale-110 transition-transform">
            <ChevronLeft size={20} />
          </div>
          <span className="font-bold uppercase tracking-widest text-xs">
            {isUzbek ? "Orqaga" : "Back"}
          </span>
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 sm:p-10"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent">
              {type === 'privacy' ? <Shield size={24} /> : <FileText size={24} />}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-primary dark:text-neutral">
                {currentContent.title}
              </h1>
              <p className="text-xs text-gray-400 font-medium">
                {currentContent.lastUpdated}
              </p>
            </div>
          </div>

          <div className="space-y-8">
            {currentContent.sections.map((section, idx) => (
              <section key={idx} className="space-y-3">
                <h2 className="text-lg font-bold text-primary dark:text-neutral flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                  {section.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
                  {section.content}
                </p>
              </section>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary dark:bg-neutral/10 rounded-full flex items-center justify-center text-neutral dark:text-neutral">
                <Lock size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {isUzbek ? "Xavfsizlik kafolati" : "Security Guaranteed"}
                </p>
                <p className="text-xs font-bold text-primary dark:text-neutral">
                  End-to-end Encryption
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a 
                href="mailto:hello@mnemonix.io"
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
              >
                <Mail size={14} />
                {isUzbek ? "Bog'lanish" : "Contact Us"}
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
