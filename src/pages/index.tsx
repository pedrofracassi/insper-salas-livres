import Head from 'next/head'
import Card from '@mui/joy/Card';
import { Alert, Badge, Chip, CircularProgress, Tab, TabList, Tabs, Typography } from '@mui/joy';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { SalasResponse } from '../types';
import useSWR from 'swr';
import luxon, { DateTime } from 'luxon';

const predios = [
  {
    nome: 'Prédio 1',
    apiName: 'PRÉDIO 1',
    andares: [-1, 1, 2, 3, 4]
  },
  {
    nome: 'Prédio 2',
    apiName: 'PRÉDIO 2',
    andares: [-1, 1, 2, 3, 4, 5]
  }
]

async function fetchSalasLivres() {
  const response = axios.get<SalasResponse>('/api/salas').then(res => res.data)
  return response
}

function getNumeroAndar(stringAndar: string) {
  if (stringAndar === 'TÉRREO') return 0
  if (stringAndar.includes('SUBSOLO')) return -parseInt(stringAndar.split('')[0])
  return parseInt(stringAndar.split('')[0])
}

export default function Home() {
  const { data, error, isLoading } = useSWR('/api/salas', fetchSalasLivres)

  const [predio, setPredio] = useState(0)
  const [andar, setAndar] = useState(0)

  // @ts-ignore
  function handlePredioChange(newValue: number) {
    setPredio(newValue)
    if (newValue !== predios.length) setAndar(predios[newValue].andares.length)
  }

  function handleAndarChange(newValue: number) {
    setAndar(newValue)
  }

  return (
    <>
      <Head>
        <title>Salas Livres Insper</title>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/>
        <link rel="manifest" href="/site.webmanifest"/>
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5"/>
        <meta name="msapplication-TileColor" content="#da532c"/>
        <meta name="theme-color" content="#ffffff"/>
      </Head>
      <main>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <Alert color='danger' style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}>
            <b>As informações mostradas aqui mostradas são calculadas com base no calendário de aulas e algumas informações extras.</b>
            <p>As salas podem estar ocupadas mesmo que estejam disponíveis aqui, pois essa página não leva em conta outros tipo de reserva (eventos, entidades, etc.).</p>
            Faça bom uso :)
          </Alert>
          <Tabs value={predio} onChange={(event, newValue) => { handlePredioChange(newValue as number) }} size='sm' color='danger'>
            <TabList variant="soft" color="neutral">
              {
                predios.map((predio, index) => (
                  <Tab key={index}>{predio.nome}</Tab>
                ))
              }
              <Tab color='danger' key={predios.length}>Todos</Tab>
            </TabList>
          </Tabs>
          {
            predio !== predios.length && (
              <Tabs value={andar} onChange={(event, newValue) => { handleAndarChange(newValue as number) }} size='sm' color='danger'>
                <TabList variant="soft" color="neutral">
                  {
                    predios[predio].andares.map((andar, index) => (
                      <Tab key={index}>{andar}º</Tab>
                    ))
                  }
                  <Tab color='danger'>Todos</Tab>
                </TabList>
              </Tabs>
            )
          }
          {
          data ? (
            data
              .filter(sala => predio === predios.length || sala.predio == predios[predio].apiName)
              .filter(sala => !predios[predio] || andar === predios[predio].andares.length || getNumeroAndar(sala.andar) == predios[predio].andares[andar])
              .sort((a, b) => a.nome > b.nome ? 1 : -1)
              .sort((a, b) => new Date(b.freeUntil).getTime() - new Date(a.freeUntil).getTime()).map((sala, index) => (
                <Card variant='outlined' key={index}>
                  <Typography level="h6" fontSize={14} color='danger'>{sala.nome}</Typography>
                  <Typography level="body2">{sala.predio} • {sala.andar}</Typography>
                  <Typography>Disponível até as <b>{DateTime.fromISO(sala.freeUntil).toLocaleString({
                    timeZone: 'America/Sao_Paulo',
                    hour: "numeric",
                    minute: "numeric",
                    hourCycle: "h23",
                  })}</b></Typography>
                </Card>
              ))
          ) : (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              padding: '6rem',
            }}>
              <CircularProgress />
            </div>
          )
        }
        </div>
      </main>
    </>
  )
}
