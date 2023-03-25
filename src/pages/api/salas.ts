// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import { parseStringPromise } from "xml2js";
import { CalendarioEvento, RootAlocacao, SalasResponse } from "../../types";

const ignoredRooms = [
  "AULA REMOTA",
  "",
  "HUB DE INOVAÇÃO - TÉRREO - PRÉDIO 2",
  "REUNIÃO 732",
];

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
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const calendario = await axios.get(
    "https://www.insper.edu.br/agenda/xml/ExibeCalendario.xml"
  );

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
  );

  const rightNow = new Date();

  const nomesSalasUnicas = [
    ...new Set(calendarioFixed.map((evento) => evento.sala)),
  ].filter((sala) => !ignoredRooms.includes(sala));

  const salasUnicas = nomesSalasUnicas.map((nomeSala) => {
    const sala = calendarioFixed.find((evento) => evento.sala === nomeSala);
    if (!sala) {
      throw new Error("Sala não encontrada");
    }
    return {
      nome: sala.sala,
      predio: sala.predio,
      andar: sala.andar,
    };
  });

  const salasLivres = salasUnicas
    .filter((sala) => {
      const eventos = calendarioFixed.filter(
        (evento) => evento.sala === sala.nome
      );
      const eventosAgora = eventos.filter((evento) => {
        return (
          evento.hora_inicio.getTime() <= rightNow.getTime() &&
          evento.hora_termino.getTime() >= rightNow.getTime()
        );
      });

      return eventosAgora.length === 0;
    })
    .map((salaLivre) => {
      const nextEvent = calendarioFixed
        .filter((evento) => evento.hora_inicio.getTime() > rightNow.getTime())
        .filter((evento) => evento.sala === salaLivre.nome)
        .sort((a, b) => a.hora_inicio.getTime() - b.hora_inicio.getTime())[0];

      const buildingClosingTime = new Date();
      buildingClosingTime.setUTCHours(23 + 3, 0, 0, 0);

      let roomClosingTime = buildingClosingTime;
      if (roomClosingTimes[salaLivre.nome]) {
        roomClosingTime = new Date();
        roomClosingTime.setUTCHours(...roomClosingTimes[salaLivre.nome]);
      }

      return {
        ...salaLivre,
        nextEvent: nextEvent ? nextEvent.titulo : null,
        freeUntil: nextEvent ? nextEvent.hora_inicio : roomClosingTime,
      };
    })
    .filter((sala) => !ignoredRooms.includes(sala.nome))
    .map((sala) => {
      return {
        ...sala,
        nome: displayNames[sala.nome] || sala.nome,
      };
    });

  res.status(200).json(salasLivres);
}
