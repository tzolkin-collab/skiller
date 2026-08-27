import BaseClient from './BaseClient';

/**
 * A conta e resolvida no cliente, pela sessao — nao mais por query param.
 * Quando houver autenticacao de verdade, o unico lugar a mudar e `lib/session`.
 */
export default function BasePage() {
  return <BaseClient />;
}
