// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import { parseStringPromise } from "xml2js";
import { CalendarioEvento, RootAlocacao, SalasResponse } from "../../types";
import hash from 'object-hash'
import { kv } from "@vercel/kv";

const ignoredRooms = [
  "AULA REMOTA",
  "",
  "HUB DE INOVAÇÃO - TÉRREO - PRÉDIO 2",
  "REUNIÃO 732",
];

const ignoredPrefixes = [
  "REUNIÃO",
  "9"
]

// IMPORTANTE: Horários sempre em UTC
const roomClosingTimes: {
  [key: string]: [number, number, number, number];
} = {
  "404 - LABORATÓRIO DE INFORMÁTICA": [21 + 3, 0, 0, 0],
  "LABORATÓRIO DESENVOLVIMENTO COLABORATIVO ÁGIL 1": [22 + 3, 50, 0, 0],
  "LABORATÓRIO DESENVOLVIMENTO COLABORATIVO ÁGIL 2": [22 + 3, 50, 0, 0],
};

const displayNames: {
  [key: string]: string;
} = {
  "LABORATÓRIO DESENVOLVIMENTO COLABORATIVO ÁGIL 1": "LAB. ÁGIL 1",
  "LABORATÓRIO DESENVOLVIMENTO COLABORATIVO ÁGIL 2": "LAB. ÁGIL 2",
  "403 - LABORATÓRIO DE SISTEMAS ELETRÔNICOS": "LAB. SISTEMAS MECATRÔNICOS"
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const calendario = await axios.get(
    "https://cgi.insper.edu.br/agenda/xml/ExibeCalendario.xml"
  );

  const allKeys = await kv.keys("votes:*")
  const allVotes = await Promise.all(allKeys.map(key => kv.smembers(key)))
  const allVotesWithKeys: {
    [key: `votes:${string}:${"UP" | "DOWN"}`]: string[]
  } = allKeys.reduce((acc, key, index) => ({
    ...acc,
    [key]: allVotes[index]
  }), {})

  const calendarioJson: RootAlocacao = await parseStringPromise(
    calendario.data
  );

  const calendarioFixed = calendarioJson.ControleAlocacao.CalendarioEvento.map(
    (evento: CalendarioEvento) => {
      // Turn a string in format HH:MM into a Date object
      const dataSplit = evento.data[0].split("/");

      const horaInicio = new Date(
        `${dataSplit[2]}-${dataSplit[1]}-${dataSplit[0]}T${evento.horainicio[0]}:00.000-0300`
      );
      const horaTermino = new Date(
        `${dataSplit[2]}-${dataSplit[1]}-${dataSplit[0]}T${evento.horatermino[0]}:00.000-0300`
      );

      return {
        data: evento.data[0],
        tipo: evento.tipoaula[0],
        hora_inicio: horaInicio,
        hora_termino: horaTermino,
        turma: evento.turma[0],
        titulo: evento.titulo[0],
        professor: evento.professor[0],
        sala: evento.sala[0],
        andar: evento.andar[0],
        predio: evento.predio[0],
        cor_predio: evento.corpredio ? evento.corpredio[0] : null,
        data_geracao: evento.datageracao[0],
        hora_geracao: evento.horageracao[0],
        cancelada: evento.cancelada[0] == "S" ? true : false,
        familia_curso: evento.familia_curso[0],
        subgrupo: evento.subgrupo ? evento.subgrupo[0] : null,
      };
    }
  )
    .filter((evento) => evento.cancelada === false)
    .filter(evento => !ignoredRooms.includes(evento.sala))
    .filter(evento => !ignoredPrefixes.some(prefix => evento.sala.startsWith(prefix)))

  const rightNow = new Date();

  const salasRedisData = await kv.hgetall<Record<string, { nome: string, predio: string, andar: string }>>("salas") || {}
  const todasSalasRedis = Object.keys(salasRedisData).map((sala) => sala + '')
  const todasSalasInsper = [
    ...new Set(calendarioFixed.map((evento) => evento.sala)),
  ]

  const newSalas: {
    [key: string]: {
      nome: string,
      predio: string,
      andar: string,
    }
  } = todasSalasInsper.filter(sala => !todasSalasRedis.includes(sala)).reduce((acc, curr, i) => ({
    ...acc,
    [curr]: {
      nome: curr,
      predio: calendarioFixed.find(evento => evento.sala === curr)?.predio,
      andar: calendarioFixed.find(evento => evento.sala === curr)?.andar,
    }
  }), {})

  if (Object.keys(newSalas).length > 0) {
    kv.hset("salas", newSalas)
  }

  const todasSalas = [
    ...new Set([
      ...todasSalasRedis.map(a => a + ''),
      ...todasSalasInsper.map(a => a + ''),
    ])
  ]

  const salasUnicas = todasSalas.map((nomeSala) => {
    const sala = calendarioFixed.find((evento) => evento.sala === nomeSala);
    if (!sala) {
      return {
        ...salasRedisData[nomeSala + ''],
        fromCache: true,
        nome: nomeSala,
      }
    }
    return {
      nome: sala.sala,
      predio: sala.predio,
      andar: sala.andar,
      fromCache: false
    };
  });

  const salasLivres = salasUnicas
    .map(sala => ({
      ...sala,
      eventosAgora: calendarioFixed.filter(
        (evento) => evento.sala === sala.nome
      ).filter((evento) => {
        return (
          evento.hora_inicio.getTime() <= rightNow.getTime() &&
          evento.hora_termino.getTime() >= rightNow.getTime()
        );
      })
    }))
    .map(sala => ({
      ...sala,
      forStudies: sala.eventosAgora.some(evento => evento.titulo === 'SALA DE ESTUDOS'),
      forStudiesUntil: sala.eventosAgora.filter(evento => evento.titulo === 'SALA DE ESTUDOS').sort((a, b) => a.hora_inicio.getTime() - b.hora_inicio.getTime())[0]?.hora_termino
    }))
    .filter((sala) => {
      return sala.eventosAgora.length === 0 || sala.forStudies;
    })
    .map((salaLivre) => {
      const nextEvent = calendarioFixed
        .filter((evento) => evento.hora_inicio.getTime() > rightNow.getTime())
        .filter((evento) => evento.sala === salaLivre.nome)
        .sort((a, b) => a.hora_inicio.getTime() - b.hora_inicio.getTime())[0];

      const buildingClosingTime = new Date();
      if (rightNow.getDay() === 6) {
        buildingClosingTime.setUTCHours(20 + 3, 0, 0, 0);
      } else {
        buildingClosingTime.setUTCHours(23 + 3, 0, 0, 0);
      }

      let roomClosingTime = buildingClosingTime;
      if (roomClosingTimes[salaLivre.nome]) {
        roomClosingTime = new Date();
        roomClosingTime.setUTCHours(...roomClosingTimes[salaLivre.nome]);
      }

      const todayEventCount = calendarioFixed.filter(
        (evento) => evento.sala === salaLivre.nome && evento.titulo !== 'SALA DE ESTUDOS'
      ).length

      return {
        ...salaLivre,
        nextEvent: nextEvent ? nextEvent.titulo : null,
        freeUntil: nextEvent ? nextEvent.hora_inicio : roomClosingTime,
        todayEventCount,
      };
    })
    .filter((sala) => !ignoredPrefixes.some(prefix => sala.nome.startsWith(prefix)))
    .filter((sala) => !ignoredRooms.includes(sala.nome))
    .filter((sala) => sala.freeUntil > rightNow)
    .map((sala) => {
      return {
        ...sala,
        nome: displayNames[sala.nome] || sala.nome,
      };
    })
    .map(sala => {
      const salaHash = hash({
        ...sala,
        eventosAgora: undefined,
        fromCache: undefined,
        todayEventCount: undefined,
      })
      return {
        ...sala,
        hash: salaHash,
        karma: (allVotesWithKeys[`votes:${salaHash}:UP`]?.length || 0) - (allVotesWithKeys[`votes:${salaHash}:DOWN`]?.length || 0),

        eventosAgora: undefined,
        fromCache: undefined,
      }
    })

  res.status(200).json(salasLivres);
}
