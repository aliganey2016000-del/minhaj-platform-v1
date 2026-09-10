export type WhatsAppBotLanguage = 'so' | 'en' | 'ar';

const translations = {
  so: {
    menu: 'Minhaj Platform — Adeegyada Waalidka\n1. Xaadiris\n2. Lacagaha\n3. Natiijooyinka\n4. Shaqooyinka\n5. Imtixaannada\n6. Carruurta\n\nU dir lambar. MENU mar kasta u dir menu-ga weyn.',
    help: 'MENU — menu-ga weyn\nLANG SO — Soomaali\nLANG EN — English\nLANG AR — Carabi\nCHILD 1, CHILD 2... — dooro ilmaha',
    noChildren: 'Ma jiro arday firfircoon oo ku xiran akoonkaaga waalidnimo. Fadlan la xiriir hay’adda.',
    chooseChild: 'Dooro ilmaha:',
    selected: 'Waxaad dooratay',
    replyNumber: 'U jawaab lambarka, tusaale 1.',
    unlinked: 'Lambarkan WhatsApp kuma xirna akoon waalid oo hay’addan ah. Fadlan la xiriir maamulka.',
    languageSaved: 'Luqadda waa la beddelay.',
    languageUsage: 'Isticmaal LANG SO, LANG EN, ama LANG AR.',
    attendance: 'Xaadiris', fees: 'Lacagaha', results: 'Natiijooyinka', assignments: 'Shaqooyinka', exams: 'Imtixaannada',
  },
  en: {
    menu: 'Minhaj Platform — Parent Services\n1. Attendance\n2. Fees\n3. Results\n4. Assignments\n5. Exams\n6. Children\n\nReply with a number. Type MENU anytime for the main menu.',
    help: 'MENU — main menu\nLANG SO — Somali\nLANG EN — English\nLANG AR — Arabic\nCHILD 1, CHILD 2... — choose a child',
    noChildren: 'No active students are linked to your parent account. Please contact your institution.',
    chooseChild: 'Select a child:',
    selected: 'Selected',
    replyNumber: 'Reply with the number, e.g. 1.',
    unlinked: 'This WhatsApp number is not linked to a parent account in this institution. Please contact your institution administrator.',
    languageSaved: 'Language updated.',
    languageUsage: 'Use LANG SO, LANG EN, or LANG AR.',
    attendance: 'Attendance', fees: 'Fees', results: 'Results', assignments: 'Assignments', exams: 'Exams',
  },
  ar: {
    menu: 'منصة منهاج — خدمات ولي الأمر\n1. الحضور\n2. الرسوم\n3. النتائج\n4. الواجبات\n5. الاختبارات\n6. الأبناء\n\nأرسل رقم الخدمة. أرسل MENU في أي وقت للقائمة الرئيسية.',
    help: 'MENU — القائمة الرئيسية\nLANG SO — الصومالية\nLANG EN — الإنجليزية\nLANG AR — العربية\nCHILD 1, CHILD 2... — اختيار الابن',
    noChildren: 'لا يوجد طلاب نشطون مرتبطون بحساب ولي الأمر. يرجى التواصل مع المؤسسة.',
    chooseChild: 'اختر الابن:',
    selected: 'تم اختيار',
    replyNumber: 'أرسل الرقم، مثال: 1.',
    unlinked: 'رقم WhatsApp هذا غير مرتبط بحساب ولي أمر في هذه المؤسسة. يرجى التواصل مع الإدارة.',
    languageSaved: 'تم تحديث اللغة.',
    languageUsage: 'استخدم LANG SO أو LANG EN أو LANG AR.',
    attendance: 'الحضور', fees: 'الرسوم', results: 'النتائج', assignments: 'الواجبات', exams: 'الاختبارات',
  },
} as const;

export function normalizeBotLanguage(value?: string | null): WhatsAppBotLanguage {
  const normalized = String(value || '').toLowerCase().trim();
  return normalized === 'so' || normalized === 'ar' ? normalized : 'en';
}

export function botText(language: WhatsAppBotLanguage, key: keyof typeof translations.en): string {
  return translations[language][key] || translations.en[key];
}

export function parseLanguageCommand(text: string): WhatsAppBotLanguage | null | undefined {
  const match = text.trim().toLowerCase().match(/^lang\s+(so|en|ar)$/);
  if (match) return match[1] as WhatsAppBotLanguage;
  if (text.trim().toLowerCase().startsWith('lang')) return null;
  return undefined;
}
