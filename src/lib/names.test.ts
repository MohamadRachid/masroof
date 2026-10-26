import { describe, expect, it } from 'vitest'
import { accountName, categoryName, iconFor } from './names'

describe('names', () => {
  it('shows the Arabic or English category name', () => {
    const c = { name_en: 'Food', name_ar: 'طعام' }
    expect(categoryName(c, 'en')).toBe('Food')
    expect(categoryName(c, 'ar')).toBe('طعام')
    expect(categoryName({ name_en: 'Gym', name_ar: '' }, 'ar')).toBe('Gym')
  })

  it('translates the default account names, keeps renamed ones as typed', () => {
    const t = (key: string) => ({ 'account.Bank': 'البنك', 'account.Cash': 'النقد', 'account.USD': 'الدولار' })[key] ?? key
    expect(accountName({ name: 'Bank' }, t)).toBe('البنك')
    expect(accountName({ name: 'USD' }, t)).toBe('الدولار')
    expect(accountName({ name: 'MoMo' }, t)).toBe('MoMo')
  })

  it('falls back to a neutral icon for unknown icon keys', () => {
    expect(iconFor('bus')).toBe('bus')
    expect(iconFor('rocket')).toBe('dots')
  })
})
