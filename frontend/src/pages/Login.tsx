// Donos: Andrey / Pedro (front)
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Login() {
  const { usuario, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  if (usuario) return <Navigate to="/" replace />

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    try {
      await login(email, senha)
      navigate('/')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado.')
    }
  }

  return (
    <form onSubmit={enviar} style={{ maxWidth: 320, margin: '4rem auto', display: 'grid', gap: 8 }}>
      <h1>Clínica Escola</h1>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      {erro && <p role="alert" style={{ color: 'crimson' }}>{erro}</p>}
      <button type="submit">Entrar</button>
    </form>
  )
}
