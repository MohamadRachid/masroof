import type { MsgKey } from './en'

// Latin digits everywhere: amounts, codes and counts are never localised.
export const ar: Record<MsgKey, string> = {
  'app.name': 'مصروف',
  'app.tagline': 'كل سيدي يدخل أو يخرج، في ثوانٍ.',

  'nav.home': 'الرئيسية',
  'nav.history': 'السجل',
  'nav.plan': 'الخطة',
  'nav.more': 'المزيد',
  'nav.add': 'إضافة',
  'nav.addEntry': 'إضافة عملية',
  'nav.main': 'التنقل الرئيسي',

  'header.langShort': 'EN',
  'header.switchLang': 'التبديل إلى الإنجليزية',

  'lang.en': 'English',
  'lang.ar': 'العربية',

  'auth.emailLabel': 'البريد الإلكتروني',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendCode': 'أرسل رمز الدخول',
  'auth.sending': 'جارٍ الإرسال…',
  'auth.codeTitle': 'تفقّد بريدك',
  'auth.codeBody': 'أدخل الرمز المكوّن من {digits} أرقام الذي أرسلناه إلى {email}.',
  'auth.codeLabel': 'رمز الدخول',
  'auth.verifying': 'جارٍ التحقق…',
  'auth.orLink': 'أو اضغط على الرابط في الرسالة.',
  'auth.resend': 'أعد إرسال الرمز',
  'auth.resendIn': 'إعادة الإرسال بعد {seconds} ث',
  'auth.changeEmail': 'استخدم بريدًا آخر',
  'auth.sent': 'تم إرسال رمز جديد.',
  'auth.offline': 'أنت غير متصل. تسجيل الدخول يحتاج إلى اتصال.',
  'auth.err.invalidEmail': 'يبدو أن البريد غير صحيح.',
  'auth.err.badCode': 'الرمز غير صالح. تحقّق منه أو اطلب رمزًا جديدًا.',
  'auth.err.rateLimited': 'محاولات كثيرة. انتظر دقيقة ثم حاول مجددًا.',
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
