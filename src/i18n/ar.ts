import type { MsgKey } from './en'

// Latin digits everywhere: amounts, codes and counts are never localised.
export const ar: Record<MsgKey, string> = {
  'app.name': 'مصروف',
  'app.tagline': 'كل سيدي يدخل أو يخرج، في ثوانٍ.',

  'nav.home': 'الرئيسية',
  'nav.history': 'السجل',
  'nav.plan': 'الخطة',
  'nav.more': 'المزيد',
  'nav.addEntry': 'إضافة عملية',
  'nav.main': 'التنقل الرئيسي',

  'header.langShort': 'EN',
  'header.switchLang': 'التبديل إلى الإنجليزية',

  'lang.en': 'English',
  'lang.ar': 'العربية',

  'auth.emailLabel': 'البريد الإلكتروني',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.passwordLabel': 'كلمة المرور',
  'auth.passwordHint': '{min} أحرف على الأقل. تكتبها مرة واحدة فقط على كل جهاز.',
  'auth.showPassword': 'إظهار كلمة المرور',
  'auth.hidePassword': 'إخفاء كلمة المرور',
  'auth.signIn': 'تسجيل الدخول',
  'auth.signingIn': 'جارٍ تسجيل الدخول…',
  'auth.createAccount': 'إنشاء الحساب',
  'auth.creating': 'جارٍ الإنشاء…',
  'auth.toSignUp': 'أول مرة؟ أنشئ حسابك',
  'auth.toSignIn': 'لديك حساب؟ سجّل الدخول',
  'auth.offline': 'أنت غير متصل. تسجيل الدخول يحتاج إلى اتصال.',
  'auth.err.invalidEmail': 'يبدو أن البريد غير صحيح.',
  'auth.err.wrongPassword': 'البريد أو كلمة المرور غير صحيحة.',
  'auth.err.exists': 'هذا البريد لديه حساب بالفعل. سجّل الدخول بدلًا من ذلك.',
  'auth.err.weakPassword': 'استخدم كلمة مرور أطول ({min} أحرف على الأقل).',
  'auth.err.notConfirmed': 'ما زال Supabase يطلب تأكيد البريد. أوقف خيار “Confirm email” في Supabase ثم حاول مجددًا.',
  'auth.err.rateLimited': 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
  'auth.err.notAllowed': 'هذا البريد غير مسموح له بتسجيل الدخول إلى مصروف.',
  'auth.err.offline': 'أنت غير متصل. اتصل بالإنترنت لتسجيل الدخول.',
  'auth.err.unknown': 'حدث خطأ ما. حاول مرة أخرى.',

  'home.title': 'اليوم',
  'home.empty.title': 'أموالك في لمحة',
  'home.empty.body': 'هنا سترى أرصدتك، وما يمكنك صرفه اليوم بأمان، وكيف يسير أسبوعك.',

  'history.title': 'السجل',
  'history.empty.title': 'لا توجد عمليات بعد',
  'history.empty.body': 'كل ما تضيفه يظهر هنا، مجمّعًا حسب اليوم وسهل البحث.',

  'plan.title': 'الخطة',
  'plan.empty.title': 'لا توجد خطة راتب بعد',
  'plan.empty.body': 'عند وصول راتبك، ستوزّعه هنا على مظاريف وترى ما تبقّى كل أسبوع.',

  'more.title': 'المزيد',
  'more.section.prefs': 'التفضيلات',
  'more.language': 'اللغة',
  'more.section.account': 'الحساب',
  'more.signedInAs': 'مسجّل الدخول باسم',
  'more.signOut': 'تسجيل الخروج',
  'more.version': 'الإصدار {version}',

  'add.title': 'إضافة عملية',
  'add.soon': 'إضافة العمليات تصل في التحديث القادم.',

  'common.close': 'إغلاق',
  'error.screen': 'حدث خطأ في هذه الشاشة. بياناتك بأمان.',
  'common.gotIt': 'حسنًا',

  'pwa.updateReady': 'نسخة جديدة جاهزة',
  'pwa.reload': 'إعادة التحميل',
}
