import { requestLocale, type Locale } from './locale';

const MESSAGES = {
  ru: {
    apiKeyRequired: 'Укажи ключ API для этого провайдера',
    assistantNotConnected: 'Подключи ассистента в настройках',
    encryptionKeyMissing: 'На сервере не задан ENCRYPTION_KEY',
    matchNotFound: 'Матч не найден',
    draftInputRequired: 'Пришли скриншот, ссылку или текст',
    csfloatPaused:
      'CSFloat исчерпал лимит запросов, ссылка заработает через {minutes} мин. Пока можно прислать скриншот',
    providerRejectedKey: 'Провайдер отклонил ключ',
    modelRefused: 'Модель отказалась отвечать на этот запрос',
    providerFailed: 'Провайдер ответил {status}: {details}',
    setLimit: 'Можно хранить до {limit} наборов',
    setNotFound: 'Набор не найден',
    wrongPassword: 'Неверный пароль',
    unknownProvider: 'Неизвестный провайдер',
    signInRequired: 'Войди через Steam',
    blueShareCaseHardenedOnly: 'Доля синего есть только у Case Hardened',
    unknownPattern: 'Неизвестный паттерн',
    itemNotListed: 'Сейчас этот предмет не продаётся ни на одном маркете',
    noPatternData: 'Нет данных о паттернах для «{name}»',
    purchaseNotFound: 'Покупка не найдена',
    steamProfileInvalid: 'Нужна ссылка на профиль Steam, SteamID64 или имя из адреса профиля',
    steamProfileNotFound: 'Профиль Steam не найден',
    steamInventoryPrivate: 'Инвентарь Steam скрыт',
  },
  en: {
    apiKeyRequired: 'Enter an API key for this provider',
    assistantNotConnected: 'Connect the assistant in settings',
    encryptionKeyMissing: 'ENCRYPTION_KEY is not set on the server',
    matchNotFound: 'Match not found',
    draftInputRequired: 'Send a screenshot, a link or text',
    csfloatPaused:
      'CSFloat ran out of requests, the link will work in {minutes} min. You can send a screenshot meanwhile',
    providerRejectedKey: 'The provider rejected the key',
    modelRefused: 'The model refused to answer this request',
    providerFailed: 'The provider answered {status}: {details}',
    setLimit: 'You can keep up to {limit} sets',
    setNotFound: 'Set not found',
    wrongPassword: 'Wrong password',
    unknownProvider: 'Unknown provider',
    signInRequired: 'Sign in with Steam',
    blueShareCaseHardenedOnly: 'Only Case Hardened items have a blue share',
    unknownPattern: 'Unknown pattern',
    itemNotListed: 'Item is not sold on any market right now',
    noPatternData: 'No pattern data for "{name}"',
    purchaseNotFound: 'Purchase not found',
    steamProfileInvalid: 'Profile must be a Steam link, SteamID64 or custom URL name',
    steamProfileNotFound: 'Steam profile not found',
    steamInventoryPrivate: 'Steam inventory is private',
  },
} satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof MESSAGES)['ru'];

export const text = (key: MessageKey, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    MESSAGES[requestLocale()][key],
  );
