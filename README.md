# Meus Gastos: análise do cartão e Pix do Nubank

App para celular (PWA) que lê a fatura do cartão e o extrato da conta do Nubank e mostra **para onde está indo seu dinheiro**: quando você gasta mais, como cada mês se compara aos anteriores e o que dá para cortar.

**Privacidade:** tudo roda no seu aparelho. Os arquivos são lidos pelo navegador e salvos só no armazenamento local do celular. Não existe servidor e nenhum dado financeiro sai do aparelho.

## Por que importar arquivos em vez de "conectar no Nubank"?

O Nubank **não oferece API pública** para pessoa física. As bibliotecas não oficiais (como `pynubank`) usam a API interna do app, violam os termos de uso e vivem quebrando ou sendo bloqueadas. Além disso, exigiriam guardar sua senha e certificado num servidor.

O caminho seguro é usar a exportação oficial do próprio app (CSV/OFX), que já traz tudo o que a análise precisa. Veja abaixo como fazer. Mais adiante, dá para trocar a importação por **Open Finance** (seção "Próximos passos").

## O que o app mostra

**Resumo do mês**
- Total gasto, variação em relação ao mês anterior e quanto saiu por cartão, Pix, débito e boleto
- Meta mensal com barra de progresso
- Evolução dos últimos 12 meses por forma de pagamento (toque numa barra para abrir o mês)
- Gastos por categoria, com comparação ao mês anterior (toque para ver as transações)
- **Ritmo do mês:** gasto acumulado dia a dia comparado ao mês anterior
- **Quando você gasta:** gasto por dia do mês e média por dia da semana (fins de semana destacados)
- Ranking de onde você mais gastou

**Insights automáticos**
- Projeção de fechamento do mês corrente (separando contas fixas do gasto do dia a dia)
- Categoria que mais cresceu em relação à média dos 3 meses anteriores, e onde você economizou
- **Efeito formiga:** quanto as compras pequenas (abaixo de R$ 30) somaram
- Quantidade de pedidos de delivery e quanto daria para economizar
- Fim de semana comparado aos dias úteis, dia da semana mais caro e dias de pico
- Concentração dos gastos na 1ª ou na 2ª quinzena
- Total de Pix enviado para pessoas
- **Gastos recorrentes e assinaturas** detectados automaticamente
- **Parcelas futuras:** quanto dos próximos meses já está comprometido
- Comparação entre o que entrou e o que saiu da conta

**Transações**
- Busca e filtros por origem, categoria e mês
- Toque numa transação para mudar a categoria, valendo para todas do mesmo estabelecimento; o app aprende
- Marque como "ignorar" transferências entre contas suas

## Como exportar do Nubank

1. **Fatura do cartão (CSV):** no app, *Cartão de crédito* → abra a fatura → *Exportar fatura*. O arquivo `Nubank_AAAA-MM-DD.csv` chega por e-mail. Exporte vários meses para ter comparações. Não renomeie o arquivo: a data do nome é usada para posicionar as parcelas.
2. **Extrato da conta, com Pix e débito (CSV ou OFX):** *Conta* → *Pedir extrato* → escolha o período e o formato. Também chega por e-mail.
3. No app, aba **Dados → Importar** e selecione todos os arquivos de uma vez. Importar o mesmo arquivo de novo não duplica nada.

> O caminho exato dos menus pode mudar entre versões do app do Nubank. Pelo app web (app.nubank.com.br) também é possível exportar.

Para não contar nada em dobro:
- "Pagamento de fatura" no extrato é ignorado, porque as compras já entram pela fatura do cartão.
- Dinheiro guardado em caixinhas (RDB) e resgates são ignorados.
- "Pagamento recebido" na fatura é ignorado. Estornos abatem o gasto.

## Como instalar no celular

O app precisa ser servido por HTTPS. O jeito mais simples é o **GitHub Pages** (já configurado em `.github/workflows/pages.yml`):

1. Faça merge desta branch na `main`.
2. No GitHub: *Settings → Pages → Source: GitHub Actions*. Em repositório privado, o Pages exige plano pago; nesse caso, use Netlify ou Cloudflare Pages, que funcionam arrastando a pasta.
3. Abra o link no celular:
   - **Android (Chrome):** menu ⋮ → *Instalar app* / *Adicionar à tela inicial*
   - **iPhone (Safari):** botão compartilhar → *Adicionar à Tela de Início*

Depois de instalado, o app abre em tela cheia e funciona offline.

**Backup:** como os dados ficam só no aparelho, use *Dados → Exportar backup* de vez em quando. O mesmo arquivo restaura os dados em outro celular.

## Rodando localmente

```bash
npm start      # servidor em http://localhost:8080
npm test       # testes dos parsers e da análise (Node 20+)
```

Não há etapa de build nem dependências para instalar. O Chart.js 4.4.1 está em `vendor/`.

## Estrutura

| Arquivo | Função |
|---|---|
| `js/parsers.js` | Lê o CSV da fatura, o CSV do extrato e o OFX; identifica Pix, débito, boleto e parcelas |
| `js/categorize.js` | Categorias e regras por palavra-chave (iFood, Uber, mercados, farmácias…) |
| `js/analysis.js` | Agregações, assinaturas, parcelas futuras e geração dos insights |
| `js/app.js` | Interface |
| `js/storage.js` | Armazenamento local e deduplicação |
| `js/demo.js` | Gera dados de exemplo no formato do Nubank |

Para melhorar a categorização, edite `RULES` em `js/categorize.js`.

## Próximos passos possíveis

- **Conexão automática via Open Finance:** agregadores autorizados pelo Banco Central, como [Pluggy](https://pluggy.ai) e [Belvo](https://belvo.com), conectam ao Nubank com o seu consentimento, pelo fluxo oficial. Isso exige um pequeno backend para guardar a chave de API do agregador. O app já está organizado para receber transações nesse mesmo formato normalizado.
- Orçamento por categoria com alertas
- Exportar o relatório do mês em PDF
