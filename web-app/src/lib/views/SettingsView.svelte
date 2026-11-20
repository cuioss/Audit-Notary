<script lang="ts">
  import ChoiceGroup from '../components/ChoiceGroup.svelte';
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
   * Settings of this browser: theme and language. The own directory entry joins it (TRH-DIR-3).
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
</style>
