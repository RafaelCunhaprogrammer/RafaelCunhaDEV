import type { FormaCobranca, Servico } from './tipos'
import { CATALOGO } from './catalogo'
import { orcar, type Orcamento } from './orcamento'

function servico(
  formaCobranca: FormaCobranca,
  precoCentavos: number | null,
  extra: Partial<Servico> = {},
): Servico {
  return {
    id: 'srv-1',
    nome: 'Serviço de teste',
    descricao: 'Descrição de teste',
    formaCobranca,
    duracaoEstimadaMin: 120,
    duracaoVisitaMin: null,
    precoCentavos,
    minimoHoras: null,
    podeExigirEquipe: false,
    perguntasAvaliacao: [],
    ativo: true,
    ...extra,
  }
}

const servicoPorHora = (preco: number) => servico('hora', preco)
const servicoPorDiaria = (preco: number) => servico('diaria', preco)

function servicoDoCatalogo(id: string): Servico {
  const encontrado = CATALOGO.find((s) => s.id === id)
  if (!encontrado) throw new Error(`serviço ausente do catálogo: ${id}`)
  return encontrado
}
const servicoPacoteHoras = () => servicoDoCatalogo('pacote-horas')

/** Estreita a união em vez de usar cast. */
function como<T extends Orcamento['tipo']>(r: Orcamento, tipo: T) {
  if (r.tipo !== tipo) throw new Error(`esperava ${tipo}, veio ${r.tipo}`)
  return r as Extract<Orcamento, { tipo: T }>
}

// ---- Catálogo real (seção 14) ----

test('catálogo carregado de fora (banco) não traz formas de cobrança extintas', () => {
  // Guarda para o catálogo vindo do banco, onde a forma chega como string sem checagem.
  const formas = (CATALOGO as unknown as { formaCobranca: string }[]).map((s) => s.formaCobranca)
  expect(formas).not.toContain('m2')
  expect(formas).not.toContain('sob_orcamento')
})

test('forma de cobrança desconhecida (vinda do banco) nunca devolve número', () => {
  const s = servico('hora', 5000, { formaCobranca: 'm2' as unknown as 'hora' })
  const r = orcar(s, { horas: 4, diarias: 1 })
  expect(r).not.toHaveProperty('valor')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})

test('diária de manutenção custa R$ 500,00 e dura 8 horas', () => {
  const s = servicoDoCatalogo('residencial-manutencao')
  expect(s.precoCentavos).toBe(50000)
  expect(s.duracaoEstimadaMin).toBe(480)
  expect(orcar(s, { diarias: 1 })).toEqual({
    tipo: 'fechado',
    valor: 50000,
    detalhe: '1 diária × R$ 500,00',
  })
})

test.each([
  ['pre-pos-mudanca', 65000],
  ['residencial-pesada', 60000],
  ['residencial-manutencao', 50000],
])('%s tem o valor que ela informou', (id, centavos) => {
  const s = servicoDoCatalogo(id)
  expect(s.precoCentavos).toBe(centavos)
  expect(s.formaCobranca).toBe('diaria')
  expect(s.duracaoEstimadaMin).toBe(480)
  expect(orcar(s, { diarias: 1 })).toMatchObject({ tipo: 'fechado', valor: centavos })
})

test('diária sem quantidade informada vale uma diária', () => {
  expect(orcar(servicoDoCatalogo('residencial-manutencao'), {})).toEqual({
    tipo: 'fechado',
    valor: 50000,
    detalhe: '1 diária × R$ 500,00',
  })
})

test('duração do serviço e duração da visita são coisas distintas', () => {
  for (const id of ['pos-obra', 'personal-organizer', 'revitalizacao-piso']) {
    const s = servicoDoCatalogo(id)
    expect(s.duracaoEstimadaMin).toBeNull()
    expect(s.duracaoVisitaMin).toBe(60)
  }
  for (const id of ['vidros', 'comercial', 'pacote-horas']) {
    expect(servicoDoCatalogo(id).duracaoEstimadaMin).toBeNull()
    expect(servicoDoCatalogo(id).duracaoVisitaMin).toBeNull()
  }
})

test('pacote de horas abaixo do mínimo não devolve valor, e diz o mínimo', () => {
  const r = orcar(servicoPacoteHoras(), { horas: 2 })
  expect(r).toEqual({
    tipo: 'abaixo_do_minimo',
    minimoHoras: 4,
    mensagem: expect.stringContaining('4 horas'),
  })
  expect(r).not.toHaveProperty('valor')
})

test('pacote de horas no mínimo exato vale R$ 280,00', () => {
  expect(orcar(servicoPacoteHoras(), { horas: 4 })).toMatchObject({ tipo: 'fechado', valor: 28000 })
  expect(servicoPacoteHoras().minimoHoras).toBe(4)
})

test('pacote de horas acima de 8 horas não fecha e não cita preço', () => {
  const r = orcar(servicoPacoteHoras(), { horas: 10 })
  expect(r).toEqual({ tipo: 'acima_do_pacote', maximoHoras: 8, mensagem: expect.any(String) })
  expect(r).not.toHaveProperty('valor')
  expect(como(r, 'acima_do_pacote').mensagem).toMatch(/diária/)
  expect(JSON.stringify(r)).not.toMatch(/R\$|\d{3,}/)
  expect(orcar(servicoPacoteHoras(), { horas: 8 })).toMatchObject({ tipo: 'fechado', valor: 56000 })
})

test('vidros e comercial pedem avaliação, com as perguntas que ela precisa', () => {
  for (const id of ['vidros', 'comercial']) {
    const r = como(orcar(servicoDoCatalogo(id), {}), 'avaliacao')
    expect(r.perguntas.length).toBeGreaterThan(0)
    expect(r.perguntas).toEqual(servicoDoCatalogo(id).perguntasAvaliacao)
  }
})

test.each(['pos-obra', 'personal-organizer', 'revitalizacao-piso'])(
  '%s exige visita técnica, não orçamento pendente',
  (id) => {
    const r = como(orcar(servicoDoCatalogo(id), {}), 'visita_tecnica')
    expect(r.mensagem).toMatch(/agendar/i)
    expect(r.mensagem).not.toMatch(/te retorna/i)
  },
)

test('nenhuma forma sem preço fechado devolve número', () => {
  const semPreco = CATALOGO.filter((s) => s.precoCentavos === null)
  expect(semPreco.length).toBeGreaterThanOrEqual(5)
  for (const s of semPreco) {
    const r = orcar(s, { horas: 8, diarias: 1 })
    expect(r).not.toHaveProperty('valor')
    expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
  }
})

test('o catálogo inteiro respeita seu contrato', () => {
  const ids = CATALOGO.map((s) => s.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).toHaveLength(9)
  for (const s of CATALOGO) {
    expect(s.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
    const comPreco = s.formaCobranca === 'diaria' || s.formaCobranca === 'hora'
    expect(s.precoCentavos !== null).toBe(comPreco)
    if (s.precoCentavos !== null) expect(Number.isSafeInteger(s.precoCentavos)).toBe(true)
    expect(s.minimoHoras === null || s.formaCobranca === 'hora').toBe(true)
    expect(s.formaCobranca === 'avaliacao').toBe(s.perguntasAvaliacao.length > 0)
  }
})

test('serviço que pode exigir equipe está marcado como tal', () => {
  // as três diárias com preço de tabela podem escapar da tabela (seção 14.3, item 4)
  for (const id of ['pre-pos-mudanca', 'residencial-pesada', 'residencial-manutencao']) {
    expect(servicoDoCatalogo(id).podeExigirEquipe).toBe(true)
  }
  expect(servicoPacoteHoras().podeExigirEquipe).toBe(false)
})

// ---- Mecânica de orcar (garantias herdadas) ----

test('serviço por hora multiplica o preço base pelas horas', () => {
  const r = orcar(servicoPorHora(5000), { horas: 4 })
  expect(r).toEqual({ tipo: 'fechado', valor: 20000, detalhe: '4 horas × R$ 50,00' })
})

test('serviço por diária multiplica pelo número de diárias', () => {
  expect(orcar(servicoPorDiaria(35000), { diarias: 3 })).toMatchObject({ valor: 105000 })
})

test('metragem nunca entra na conta', () => {
  const r = orcar(servicoPorHora(5000), { horas: 2, metrosQuadrados: 300 } as never)
  expect(r).toMatchObject({ tipo: 'fechado', valor: 10000 })
  expect(orcar(servicoPorHora(5000), { metrosQuadrados: 300 } as never).tipo).toBe('falta_medida')
})

test('avaliação nunca devolve número, mesmo com preço cadastrado por engano', () => {
  const s = servico('avaliacao', 5000, { perguntasAvaliacao: ['Qual o tamanho do local?'] })
  const r = orcar(s, { horas: 4, diarias: 2 })
  expect(r).toEqual({
    tipo: 'avaliacao',
    mensagem: expect.any(String),
    perguntas: ['Qual o tamanho do local?'],
  })
  expect(r).not.toHaveProperty('valor')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})

test('visita técnica nunca devolve número, mesmo com preço cadastrado por engano', () => {
  const r = orcar(servico('visita_tecnica', 5000), { horas: 4, diarias: 2 })
  expect(r).toEqual({ tipo: 'visita_tecnica', mensagem: expect.any(String) })
  expect(r).not.toHaveProperty('valor')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})

test('avaliação sem perguntas cadastradas ainda pergunta o essencial', () => {
  const r = como(orcar(servico('avaliacao', null), {}), 'avaliacao')
  expect(r.perguntas.length).toBeGreaterThan(0)
})

test('horas ausentes não devolvem número: faltam medidas, não é avaliação', () => {
  const r = como(orcar(servicoPorHora(5000), {}), 'falta_medida')
  expect(r.perguntas.length).toBeGreaterThan(0)
  expect(r).not.toHaveProperty('valor')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})

test('medida zero, negativa ou inválida não devolve número', () => {
  for (const r of [
    orcar(servicoPorHora(5000), { horas: 0 }),
    orcar(servicoPorHora(5000), { horas: -2 }),
    orcar(servicoPorHora(5000), { horas: NaN }),
    orcar(servicoPorDiaria(35000), { diarias: 0 }),
    orcar(servicoPorDiaria(35000), { diarias: Infinity }),
  ]) {
    expect(r.tipo).toBe('falta_medida')
    expect(r).not.toHaveProperty('valor')
  }
})

test('só a medida exigida pela forma de cobrança conta', () => {
  const r = orcar(servicoPorHora(5000), { horas: 2, diarias: 9 })
  expect(r).toMatchObject({ tipo: 'fechado', valor: 10000 })
  expect(orcar(servicoPorHora(5000), { diarias: 9 }).tipo).toBe('falta_medida')
})

test('serviço com preço cobrável mas sem preço cadastrado não inventa valor', () => {
  const r = orcar(servico('hora', null), { horas: 4 })
  expect(r.tipo).toBe('avaliacao')
  expect(r).not.toHaveProperty('valor')
  expect(JSON.stringify(r)).not.toMatch(/\d{3,}/)
})

test('quantidade fracionária usa vírgula decimal no detalhe', () => {
  expect(orcar(servicoPorHora(5000), { horas: 2.5 })).toEqual({
    tipo: 'fechado',
    valor: 12500,
    detalhe: '2,5 horas × R$ 50,00',
  })
})

test('medida minúscula que arredonda para zero não orça como grátis', () => {
  const r = orcar(servicoPorHora(5000), { horas: 0.00001 })
  expect(r.tipo).toBe('falta_medida')
  expect(r).not.toHaveProperty('valor')
})

test('medida absurda não vira valor', () => {
  expect(orcar(servicoPorHora(5000), { horas: 1e21 }).tipo).toBe('acima_do_pacote')
  expect(orcar(servicoPorDiaria(35000), { diarias: 1e21 }).tipo).toBe('falta_medida')
})

test('mínimo de horas abaixo do mínimo cita a quantidade com vírgula decimal', () => {
  const s = servico('hora', 7000, { minimoHoras: 4.5 })
  expect(como(orcar(s, { horas: 2 }), 'abaixo_do_minimo').mensagem).toContain('4,5 horas')
})

test('as saídas sem valor são congeladas', () => {
  expect(Object.isFrozen(orcar(servico('visita_tecnica', null), {}))).toBe(true)
  const av = como(orcar(servicoDoCatalogo('vidros'), {}), 'avaliacao')
  expect(Object.isFrozen(av)).toBe(true)
  expect(Object.isFrozen(av.perguntas)).toBe(true)
  const fm = como(orcar(servicoPorHora(5000), { horas: 0 }), 'falta_medida')
  expect(Object.isFrozen(fm)).toBe(true)
  expect(Object.isFrozen(fm.perguntas)).toBe(true)
  expect(Object.isFrozen(orcar(servicoPorHora(5000), { horas: 10 }))).toBe(true)
  expect(Object.isFrozen(orcar(servicoPacoteHoras(), { horas: 2 }))).toBe(true)
})
