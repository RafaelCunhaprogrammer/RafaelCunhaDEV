import { describe, expect, test } from 'vitest'
import { normalizarTelefone } from './telefone'

describe('normalizarTelefone', () => {
  test.each([
    ['(48) 99999-1234', '+5548999991234'],
    ['48999991234', '+5548999991234'],
    ['+55 48 99999-1234', '+5548999991234'],
    ['5548999991234', '+5548999991234'],
    ['99999-1234', '+5548999991234'], // sem DDD assume Florianópolis
    ['3333-1234', '+554833331234'], // fixo sem DDD
    ['(11) 98888-7777', '+5511988887777'], // outro DDD é respeitado
    ['(55) 98888-7777', '+5555988887777'], // DDD 55 não é confundido com o país
  ])('normaliza %s', (bruto, esperado) => {
    expect(normalizarTelefone(bruto)).toBe(esperado)
  })

  test('formatos diferentes do mesmo número dão o mesmo resultado', () => {
    const formas = ['(48) 99999-1234', '48 99999 1234', '+55 (48) 99999.1234', '048999991234']
    expect(new Set(formas.map(normalizarTelefone)).size).toBe(1)
  })

  test.each(['123', '', 'abc', '(48) 9999-12345678'])('rejeita %j', (bruto) => {
    expect(() => normalizarTelefone(bruto)).toThrow()
  })
})
