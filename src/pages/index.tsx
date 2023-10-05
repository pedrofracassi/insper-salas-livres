import Head from 'next/head'
import Card from '@mui/joy/Card';
import { Alert, Badge, Button, Chip, CircularProgress, Tab, TabList, Tabs, Typography } from '@mui/joy';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { SalasResponse } from '../types';
import useSWR from 'swr';
import { DateTime } from 'luxon';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/react';
import va from '@vercel/analytics';
import { GetServerSideProps, GetServerSidePropsContext, GetStaticProps, GetStaticPropsContext, InferGetServerSidePropsType, NextPageContext } from 'next';
import { getAll } from '@vercel/edge-config'

const predios = [
  {
    nome: 'Prédio 1',
    apiName: 'PRÉDIO 1',
    andares: [-1, 1, 2, 3, 4]
  },
  {
    nome: 'Prédio 2',
    apiName: 'PRÉDIO 2',
    andares: [1, 2, 3, 4, 5]
  }
]

type Config = {
  enableVotes: boolean,
  showNewsCard: boolean,
  newsCardTitle: string,
  newsCardText: string,
  showTopCard: boolean,
}

export const getStaticProps: GetStaticProps<{ config: Config }> = async (context: GetStaticPropsContext) => {
  const config = await getAll<Config>();
  return {
    props: { config },
    revalidate: 60 * 15,
  };
}

async function fetchSalasLivres() {
  const response = await axios.get<SalasResponse>('/api/salas').then(res => res.data)
  return response.map(sala => ({
    ...sala,
    sortingKarma: sala.karma,
  }))
}

const interleave = (arr: any[], x: any) => arr.flatMap(e => [e, x]).slice(0, -1)

function getNumeroAndar(stringAndar: string) {
  if (stringAndar === 'TÉRREO') return 0
  if (stringAndar.includes('SUBSOLO')) return -parseInt(stringAndar.split('')[0])
  return parseInt(stringAndar.split('')[0])
}

export default function Home({ config }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { data, error, isLoading, mutate } = useSWR('/api/salas', fetchSalasLivres)

  const [predio, setPredio] = useState(predios.length)
  const [andar, setAndar] = useState(0)
  const [votes, setVotes] = useState<{ [key: string]: 'UP' | 'DOWN' }>({})
  const [isVoting, setIsVoting] = useState<{ [key: string]: 'UP' | 'DOWN' | false }>({})

  useEffect(() => {
    if (!localStorage.getItem('userId')) {
      localStorage.setItem('userId', crypto.randomUUID())
      va.track('new_userid', { id: localStorage.getItem('userId') })
    }

    setVotes(JSON.parse(localStorage.getItem('votes') || `{}`) || {})
  }, [])

  // @ts-ignore
  function handlePredioChange(newValue: number) {
    setPredio(newValue)
    va.track('predio_filter', {
      predio: predio,
      andar: newValue,
    })
    if (newValue !== predios.length) setAndar(predios[newValue].andares.length)
  }

  function handleAndarChange(newValue: number) {
    setAndar(newValue)
    va.track('andar_filter', {
      predio: predio,
      andar: newValue,
    })
  }

  async function setVote(hash: string, vote: 'UP' | 'DOWN') {
    setIsVoting(isVoting => ({ ...isVoting, [hash]: vote }))
    const response = await axios.post('/api/vote', {
      hash,
      vote,
      user_id: localStorage.getItem('userId'),
    })
    if (response.status === 200) {
      setVotes(votes => {
        const voteObject = { ...votes, [hash]: vote }
        localStorage.setItem('votes', JSON.stringify(voteObject))
        return voteObject
      })
      mutate(data => ([
        ...data!.filter(sala => sala.hash !== hash),
        {
          ...data!.find(sala => sala.hash === hash)!,
          karma: response.data.score
        }
      ]), false)
      setIsVoting(isVoting => ({ ...isVoting, [hash]: false }))
    }
    
    va.track(`vote_${vote.toLowerCase()}`, {
      room_hash: hash,
      user_id: localStorage.getItem('userId'),
    })
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
      <main style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: '500px',
          width: '100%',
        }}>
          {
            config.showTopCard ? (
              <Alert color='danger' style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}>
                <Typography
                  color='danger'
                >
                  <b>As informações mostradas aqui são calculadas com base no calendário de aulas e algumas informações extras sobre os laboratórios.</b> As salas podem estar ocupadas mesmo que estejam disponíveis aqui, pois essa página não leva em conta outros tipo de reserva (eventos, reuniões, entidades, etc.). Faça bom uso!
                  <br />
                  <br />
                  – <Link href='https://instagram.com/pedro.fracassi'>Fracassi</Link> ;)
                </Typography>
              </Alert>
            ) : <></>
          }
          {
            config.showNewsCard ? (
              <Alert color='warning' style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start'
              }}>
                <Typography
                  color='warning'
                >
                  <b>{config.newsCardTitle} </b>
                  {
                    interleave(config.newsCardText.split('\n').map((line, index) => (
                      <Typography key={index} color='warning'>{line}</Typography>
                    )), <br />)
                  }
                </Typography>
              </Alert>
            ) : <></>
          }
          <Tabs style={{width: '100%'}} value={predio} onChange={(event, newValue) => { handlePredioChange(newValue as number) }} size='sm' color='danger'>
            <TabList style={{ width: '100%' }} variant="soft" color="neutral">
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
              .sort((a, b) => a.todayEventCount > b.todayEventCount ? -1 : 1)
              .sort((a, b) => new Date(b.freeUntil).getTime() - new Date(a.freeUntil).getTime())
              .sort((a, b) => a.forStudiesUntil && b.forStudiesUntil ? new Date(b.forStudiesUntil).getTime() - new Date(a.forStudiesUntil).getTime() : 0)
              .sort((a, b) => a.forStudies ? -1 : 1)
              .sort((a, b) => config.enableVotes ? b.sortingKarma - a.sortingKarma : 0)
              .map((sala, index) => (
                <Card variant='outlined' key={sala.nome}>
                  <div style={{display: 'flex'}}>
                    <div style={{flexGrow: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                      <Typography level="h2" fontSize={14} color='danger'>{sala.nome}</Typography>
                      <Typography level="body2">{sala.predio} • {sala.andar}</Typography>
                      <Typography>Disponível até as <b>{DateTime.fromISO(sala.freeUntil).toLocaleString({
                        timeZone: 'America/Sao_Paulo',
                        hour: "numeric",
                        minute: "numeric",
                        hourCycle: "h23",
                      })}</b></Typography>
                      {
                        sala.todayEventCount === 0 ? (
                          <Typography color='warning'>⭐ Sem aulas hoje</Typography>
                        ) : <></>
                      }
                      {
                        sala.forStudies && sala.forStudiesUntil ? (
                          <Typography color='success'>✅ Reservada para estudos até <b>{DateTime.fromISO(sala.forStudiesUntil).toLocaleString({
                            timeZone: 'America/Sao_Paulo',
                            hour: "numeric",
                            minute: "numeric",
                            hourCycle: "h23",
                          })}</b></Typography>
                        ) : <></>
                      }
                    </div>
                    {
                      config.enableVotes ? (
                        <div style={{ display: 'flex', justifyContent: 'center', flexDirection: 'column', gap: '0.2em', alignItems: 'center' }}>
                          <Button onClick={() => {
                            setVote(sala.hash, 'UP')
                          }} disabled={votes[sala.hash] === 'UP' || !!isVoting[sala.hash]} loading={isVoting[sala.hash] == 'UP'} size='sm'>👍</Button>
                          <Typography color={sala.karma != 0 ? sala.karma >= 1 ? 'success' : 'danger' : undefined}><b>{sala.karma}</b></Typography>
                          <Button onClick={() => {
                            setVote(sala.hash, 'DOWN')
                          }} disabled={votes[sala.hash] === 'DOWN' || !!isVoting[sala.hash]} loading={isVoting[sala.hash] == 'DOWN'} size='sm'>👎</Button>
                        </div>
                      ) : <></>
                    }
                  </div>
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
      <Analytics />
    </>
  )
}
