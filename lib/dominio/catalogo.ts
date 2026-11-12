import type { Servico } from './tipos'

/**
 * Catálogo real, informado pela Allana (especificação, seção 14.1 e 14.2).
 * Só dados: nenhuma regra de cálculo mora aqui. Preços em centavos.
 *
 * Durações: `duracaoEstimadaMin` é sempre a do trabalho. A diária é de 8 horas
 * (480 min); onde não se sabe, é null (serviços por avaliação, por visita técnica
 * e o pacote de horas, cuja duração vem das horas orçadas). A visita técnica é um
 * compromisso à parte, com `duracaoVisitaMin`. A seção 7.3 do formulário pede as
 * durações reais a ela.
 */
const OITO_HORAS = 480
const DURACAO_VISITA_MIN = 60

export const CATALOGO: Servico[] = [
  {
    id: 'pre-pos-mudanca',
    nome: 'Limpeza pré e pós-mudança',
    descricao: 'Limpeza completa do imóvel antes ou depois de uma mudança. Diária de até 8 horas.',
    formaCobranca: 'diaria',
    duracaoEstimadaMin: OITO_HORAS,
    duracaoVisitaMin: null,
    precoCentavos: 65000,
    minimoHoras: null,
    podeExigirEquipe: true,
    perguntasAvaliacao: [],
    ativo: true,
  },
  {
    id: 'residencial-pesada',
    nome: 'Limpeza residencial pesada',
    descricao: 'Limpeza profunda de residência com sujeira acumulada. Diária de até 8 horas.',
    formaCobranca: 'diaria',
    duracaoEstimadaMin: OITO_HORAS,
    duracaoVisitaMin: null,
    precoCentavos: 60000,
    minimoHoras: null,
    podeExigirEquipe: true,
    perguntasAvaliacao: [],
    ativo: true,
  },
  {
    id: 'residencial-manutencao',
    nome: 'Limpeza residencial de manutenção',
    descricao: 'Limpeza de rotina para manter a residência em dia. Diária de até 8 horas.',
    formaCobranca: 'diaria',
    duracaoEstimadaMin: OITO_HORAS,
    duracaoVisitaMin: null,
    precoCentavos: 50000,
    minimoHoras: null,
    podeExigirEquipe: true,
    perguntasAvaliacao: [],
    ativo: true,
  },
  {
    id: 'vidros',
    nome: 'Limpeza de vidros e esquadrias',
    descricao: 'Limpeza de vidros, janelas e esquadrias. O valor é passado após uma avaliação.',
    formaCobranca: 'avaliacao',
    duracaoEstimadaMin: null,
    duracaoVisitaMin: null,
    precoCentavos: null,
    minimoHoras: null,
    podeExigirEquipe: false,
    perguntasAvaliacao: [
      'Quantas janelas e portas de vidro o imóvel tem?',
      'Em qual andar fica o imóvel, e as janelas são acessíveis por dentro?',
      'Os vidros são de tamanho comum ou há painéis grandes, como sacadas e fachadas envidraçadas?',
      'Há esquadrias de alumínio ou persianas que também precisam de limpeza?',
      'Os vidros estão com sujeira recente ou com resíduos de obra, tinta ou manchas antigas?',
    ],
    ativo: true,
  },
  {
    id: 'comercial',
    nome: 'Limpeza comercial',
    descricao: 'Limpeza de lojas, consultórios e escritórios. O valor é passado após uma avaliação.',
    formaCobranca: 'avaliacao',
    duracaoEstimadaMin: null,
    duracaoVisitaMin: null,
    precoCentavos: null,
    minimoHoras: null,
    podeExigirEquipe: false,
    perguntasAvaliacao: [
      'Que tipo de espaço é: loja, consultório, escritório ou outro?',
      'Qual é o tamanho do local? Se não souber a metragem, diga quantos ambientes ele tem.',
      'Com que frequência a limpeza seria feita: uma vez só, semanal ou outra periodicidade?',
      'Em que dias e horários o acesso ao local é permitido para a limpeza?',
      'O local tem áreas que exigem cuidado especial, como equipamentos, vidros grandes ou piso delicado?',
    ],
    ativo: true,
  },
  {
    id: 'pos-obra',
    nome: 'Limpeza pós-obra',
    descricao: 'Limpeza após reforma ou construção. Só é possível orçar depois de uma visita técnica.',
    formaCobranca: 'visita_tecnica',
    duracaoEstimadaMin: null,
    duracaoVisitaMin: DURACAO_VISITA_MIN,
    precoCentavos: null,
    minimoHoras: null,
    podeExigirEquipe: false,
    perguntasAvaliacao: [],
    ativo: true,
  },
  {
    id: 'personal-organizer',
    nome: 'Organização de ambientes (Personal Organizer)',
    descricao: 'Organização de ambientes da casa. Só é possível orçar depois de uma visita técnica.',
    formaCobranca: 'visita_tecnica',
    duracaoEstimadaMin: null,
    duracaoVisitaMin: DURACAO_VISITA_MIN,
    precoCentavos: null,
    minimoHoras: null,
    podeExigirEquipe: false,
    perguntasAvaliacao: [],
    ativo: true,
  },
  {
    id: 'revitalizacao-piso',
    nome: 'Revitalização de piso',
    descricao: 'Recuperação do aspecto do piso. Só é possível orçar depois de uma visita técnica.',
    // PROVISÓRIO: a Allana lembrou deste serviço depois de enviar a lista e não disse
    // a categoria. Por decisão do Rafael (12/11/2026), fica como visita técnica até
    // ela confirmar; a seção 7.3 do formulário de configuração resolve isso. Sem preço inventado.
    formaCobranca: 'visita_tecnica',
    duracaoEstimadaMin: null,
    duracaoVisitaMin: DURACAO_VISITA_MIN,
    precoCentavos: null,
    minimoHoras: null,
    podeExigirEquipe: false,
    perguntasAvaliacao: [],
    ativo: true,
  },
  {
    id: 'pacote-horas',
    nome: 'Pacote de horas',
    descricao:
      'R$ 70,00 por hora, mínimo de 4 horas. Exclusivo para ambientes pequenos, mediante avaliação da demanda.',
    formaCobranca: 'hora',
    duracaoEstimadaMin: null,
    duracaoVisitaMin: null,
    precoCentavos: 7000,
    minimoHoras: 4,
    podeExigirEquipe: false,
    perguntasAvaliacao: [],
    ativo: true,
  },
]
