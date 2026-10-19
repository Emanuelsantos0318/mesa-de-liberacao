# Decisões institucionais de Nutrição

Registro das decisões fornecidas pela unidade para orientar a evolução do Mesa de Liberação.

## Dietas e siglas

As combinações entre as siglas autorizadas são permitidas, desde que a prescrição contenha o solicitante. O sistema não deduz combinações pelo diagnóstico.

| Dieta | Sigla |
| --- | --- |
| Normal | N |
| Pastosa | P |
| Branda | B |
| Hipocálica | K |
| Hipossódica | S/S |
| Hipolipídica | S/G |
| Diabética | D |
| Obstipante | OBST |
| Semilíquida | SL |
| Laxante | LAX |
| Líquida restrita | LR |
| Imuno | IMU |
| Intolerante à lactose | Int Lactose |
| Sem leite | S/Leite |
| Renal | Renal |
| Pastosa líquida | P/L |

`K` representa hipocálica e `S/S` representa hipossódica.

## Jejum e dieta zero

- Dieta zero é encerrada somente quando uma nova dieta é inserida.
- Enquanto o paciente estiver em jejum, não pode receber refeição.
- Todos os perfis podem autorizar exceções, quando houver uma exceção institucional registrada.

A implementação persistente de jejum/ exceção ainda requer um campo próprio, com responsável, horário e justificativa. Não deve ser codificada apenas em texto livre de restrições.

## Liberações e etiquetas

As refeições operacionais são classificadas como: **Desjejum, Colação, Almoço, Lanche, Lanche Reforçado, Ceia Completa e Ceia Leve**.

- Lanche Reforçado sempre gera três etiquetas.
- Cada solicitação extra gera uma nova etiqueta independente.
- Após impressa, a liberação deve possuir ação explícita de reimpressão.
- Reimpressões devem permanecer auditáveis.
