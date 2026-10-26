export const en = {
  'app.name': 'Masroof',
  'app.tagline': 'Every cedi in and out, in seconds.',

  'nav.home': 'Home',
  'nav.history': 'History',
  'nav.plan': 'Plan',
  'nav.more': 'More',
  'nav.add': 'Add',
  'nav.addEntry': 'Add entry',
  'nav.main': 'Main',

  'header.langShort': 'ع',
  'header.switchLang': 'Switch to Arabic',

  'lang.en': 'English',
  'lang.ar': 'العربية',

  'auth.emailLabel': 'Email',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendCode': 'Send sign-in code',
  'auth.sending': 'Sending…',
  'auth.codeTitle': 'Check your email',
  'auth.codeBody': 'Enter the {digits}-digit code we sent to {email}.',
  'auth.codeLabel': 'Sign-in code',
  'auth.verifying': 'Checking…',
  'auth.orLink': 'Or just tap the link in the email.',
  'auth.resend': 'Resend code',
  'auth.resendIn': 'Resend in {seconds}s',
  'auth.changeEmail': 'Use a different email',
  'auth.sent': 'New code sent.',
  'auth.offline': 'You’re offline. Signing in needs a connection.',
  'auth.err.invalidEmail': 'That email doesn’t look right.',
  'auth.err.badCode': 'That code didn’t work. Check it, or send a new one.',
  'auth.err.rateLimited': 'Too many tries. Wait a minute, then try again.',
  'auth.err.offline': 'You’re offline. Connect to sign in.',
  'auth.err.unknown': 'Something went wrong. Try again.',

  'home.title': 'Today',
  'home.empty.title': 'Your money, at a glance',
  'home.empty.body': 'Balances, what’s safe to spend today, and how your week is going will live here.',

  'history.title': 'History',
  'history.empty.title': 'No entries yet',
  'history.empty.body': 'Everything you add shows up here, grouped by day and easy to search.',

  'plan.title': 'Plan',
  'plan.empty.title': 'No salary plan yet',
  'plan.empty.body': 'When your salary lands, you’ll split it into envelopes here and see what’s left each week.',

  'more.title': 'More',
  'more.section.prefs': 'Preferences',
  'more.language': 'Language',
  'more.section.account': 'Account',
  'more.signedInAs': 'Signed in as',
  'more.signOut': 'Sign out',
  'more.version': 'Version {version}',

  'add.title': 'Add entry',
  'add.soon': 'Adding entries arrives in the next update.',

  'common.close': 'Close',
  'common.gotIt': 'Got it',

  'pwa.updateReady': 'New version ready',
  'pwa.reload': 'Reload',
} as const

export type MsgKey = keyof typeof en
