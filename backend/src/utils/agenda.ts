import { env } from './env.js'

/** Duração padrão de uma consulta agendada (minutos). */
export const DURACAO_CONSULTA_MIN = 30

const formatador = new Intl.DateTimeFormat('en-US', {
  timeZone: env.FUSO_CLINICA,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Dia da semana (0 = domingo) e minutos desde 00:00 no fuso da clínica. */
export function partesLocais(data: Date) {
  const p = Object.fromEntries(formatador.formatToParts(data).map((x) => [x.type, x.value]))
  return { diaSemana: DIAS.indexOf(p.weekday ?? ''), minutos: Number(p.hour) * 60 + Number(p.minute) }
}

const formatadorData = new Intl.DateTimeFormat('en-US', {
  timeZone: env.FUSO_CLINICA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Meia-noite (no fuso da clínica) do dia de `data`, deslocada `dias` dias. */
export function inicioDoDiaLocal(data: Date, dias = 0) {
  const p = Object.fromEntries(formatadorData.formatToParts(data).map((x) => [x.type, Number(x.value)]))
  const comoUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  const deslocamento = comoUtc - Math.floor(data.getTime() / 1000) * 1000
  return new Date(Date.UTC(p.year!, p.month! - 1, p.day! + dias) - deslocamento)
}

/** "08:30" -> 510 */
export const paraMinutos = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface Faixa {
  diaSemana: number
  inicio: string
  fim: string
}

/** A consulta (início + duração padrão) cabe inteira em alguma faixa do dia? */
export function cabeNasFaixas(data: Date, faixas: Faixa[]) {
  const { diaSemana, minutos } = partesLocais(data)
  return faixas.some(
    (f) =>
      f.diaSemana === diaSemana &&
      paraMinutos(f.inicio) <= minutos &&
      minutos + DURACAO_CONSULTA_MIN <= paraMinutos(f.fim),
  )
}
