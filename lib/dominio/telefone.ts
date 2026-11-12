/**
 * Telefone na forma E.164 brasileira (`+5548999991234`), a única forma em que ele
 * é gravado e comparado. Módulo puro.
 *
 * Descarta tudo que não é dígito antes de interpretar. Sem DDD, assume
 * Florianópolis (48). Aceita celular (9 dígitos) e fixo (8) de cada lado.
 */
const DDD_PADRAO = '48'

export function normalizarTelefone(bruto: string): string {
  // Zero à esquerda é o prefixo de operadora ("048..."), não faz parte do número.
  let digitos = bruto.replace(/\D/g, '').replace(/^0+/, '')

  // Só 12 ou 13 dígitos começando em 55 trazem o código do país; com 10 ou 11, o
  // "55" é o DDD do Rio Grande do Sul.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2)
  }

  // Sem DDD: 8 ou 9 dígitos.
  if (digitos.length === 8 || digitos.length === 9) digitos = DDD_PADRAO + digitos

  if (digitos.length !== 10 && digitos.length !== 11) {
    throw new Error(`Telefone inválido: "${bruto}"`)
  }
  return `+55${digitos}`
}
