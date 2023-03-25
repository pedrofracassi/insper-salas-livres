import { CssVarsProvider, extendTheme } from '@mui/joy'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  const theme = extendTheme({
    colorSchemes: {
      light: {
        palette: {
          primary: {
            
          }
        }
      }
    }
  })

  return <CssVarsProvider>
    <Component {...pageProps} />
  </CssVarsProvider>
}
