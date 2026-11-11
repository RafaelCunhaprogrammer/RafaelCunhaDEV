import { FUSO, REGRAS_PADRAO, reais } from './tipos'

test('o fuso do projeto é o de São Paulo', () => {
  expect(FUSO).toBe('America/Sao_Paulo')
})

test('formata centavos como real brasileiro', () => {
  expect(reais(18000)).toBe('R$ 180,00')
  expect(reais(0)).toBe('R$ 0,00')
  expect(reais(5)).toBe('R$ 0,05')
})

test('o sistema nasce com coleira curta: não fecha com cliente novo', () => {
  expect(REGRAS_PADRAO.podeFecharComClienteNovo).toBe(false)
})
