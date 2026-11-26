<script lang="ts">
  import ChoiceGroup from '../components/ChoiceGroup.svelte';
  import Link from '../components/Link.svelte';
  import { PROFILE_ADDRESS } from '../directory/directory';
  import { currentLocale, isLocale, setLocale, t } from '../i18n';
  import {
    applyTheme,
    isThemeChoice,
    readThemeChoice,
    writeThemeChoice,
    type ThemeChoice,
  } from '../theme';
  import WizardPage from '../templates/WizardPage.svelte';

  /**
   * Settings of this browser: theme and language, and the way to the own directory entry (AUN-DIR-3), which has its own
   * page, `/settings/profile`.
   */
  let theme: ThemeChoice = $state(readThemeChoice());

  function chooseTheme(value: string) {
    if (!isThemeChoice(value)) return;
    theme = value;
    writeThemeChoice(value);
    applyTheme(value);
  }

  function chooseLanguage(value: string) {
    if (isLocale(value)) void setLocale(value);
  }
</script>

<WizardPage title={$t('settings.title')} testId="settings-view">
  <section class="settings__section">
    <h2 class="settings__heading">{$t('settings.appearance')}</h2>
    <ChoiceGroup
      legend={$t('settings.theme')}
      value={theme}
      onchange={chooseTheme}
      testId="theme"
      choices={[
        { value: 'light', label: $t('settings.theme.light') },
        { value: 'dark', label: $t('settings.theme.dark') },
        { value: 'system', label: $t('settings.theme.system') },
      ]}
    />
    <ChoiceGroup
      legend={$t('settings.language')}
      value={$currentLocale}
      onchange={chooseLanguage}
      testId="language"
      choices={[
        { value: 'en', label: $t('settings.language.en') },
        { value: 'de', label: $t('settings.language.de') },
      ]}
    />
  </section>
  <section class="settings__section">
    <h2 class="settings__heading">{$t('settings.profile')}</h2>
    <p class="settings__note">{$t('settings.profile.body')}</p>
    <div>
      <Link href={PROFILE_ADDRESS} look="secondary" data-testid="settings-profile">
        {$t('settings.profile.open')}
      </Link>
    </div>
  </section>
</WizardPage>

<style>
  .settings__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .settings__heading {
    font-size: var(--text-lg);
  }

  .settings__note {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }
</style>
