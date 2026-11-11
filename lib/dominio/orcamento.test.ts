import type { FormaCobranca, Servico } from './tipos'
import { orcar } from './orcamento'

function servico(
  formaCobranca: FormaCobranca,
  precoCentavos: number | null,
): Servico {
  return {
    id: 'srv-1',
    nome: 'Serviço de teste',
    descricao: 'Descrição de teste',
    formaCobranca,
    duracaoEstimadaMin: 120,
    precoCentavos,
    ativo: true,
  }
}

const servicoPorHora = (preco: number) => servico('hora', preco)
const servicoPorM2 = (preco: number) => servico('m2', preco)
const servicoPorDiaria = (preco: number) => servico('diaria', preco)
const servicoSobOrcamento = () => servico('sob_orcamento', null)

test('serviço por hora multiplica o preço base pelas horas', () => {
  const r = orcar(servicoPorHora(5000), { horas: 4 })
  expect(r).toEqual({ tipo: 'fechado', valor: 20000, detalhe: '4 horas × R$ 50,00' })
})

test('serviço por metro quadrado arredonda para o centavo mais próximo', () => {
  // 1,27/m² sobre 120,5 m² = 153,035 -> 153,04
  const r = orcar(servicoPorM2(127), { metrosQuadrados: 120.5 })
  expect(r.tipo).toBe('fechado')
  expect((r as any).valor).toBe(15304)
})

test('serviço por diária multiplica pelo número de diárias', () => {
  expect((orcar(servicoPorDiaria(35000), { diarias: 3 }) as any).valor).toBe(105000)
})

test('serviço sob orçamento nunca devolve número', () => {
  const r = orcar(servicoSobOrcamento(), { metrosQuadrados: 400 })
  expect(r.tipo).toBe('sob_orcamento')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})

test('medida ausente para a forma de cobrança cai em sob orçamento', () => {
  expect(orcar(servicoPorM2(127), {}).tipo).toBe('sob_orcamento')
})

test('medida zero, negativa ou inválida cai em sob orçamento', () => {
  expect(orcar(servicoPorHora(5000), { horas: 0 }).tipo).toBe('sob_orcamento')
  expect(orcar(servicoPorHora(5000), { horas: -2 }).tipo).toBe('sob_orcamento')
  expect(orcar(servicoPorM2(127), { metrosQuadrados: NaN }).tipo).toBe('sob_orcamento')
  expect(orcar(servicoPorDiaria(35000), { diarias: Infinity }).tipo).toBe('sob_orcamento')
})

test('só a medida exigida pela forma de cobrança conta', () => {
  const r = orcar(servicoPorHora(5000), { horas: 2, metrosQuadrados: 300, diarias: 9 })
  expect((r as any).valor).toBe(10000)
  // medida de outra forma não substitui a exigida
  expect(orcar(servicoPorHora(5000), { metrosQuadrados: 300 }).tipo).toBe('sob_orcamento')
})

test('serviço com preço cobrável mas sem preço cadastrado não inventa valor', () => {
  const r = orcar(servico('hora', null), { horas: 4 })
  expect(r.tipo).toBe('sob_orcamento')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})
