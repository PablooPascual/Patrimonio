# WealthTerm 💹

Dashboard de patrimonio personal con estética terminal. Sin backend, sin cuentas, sin suscripciones — todo en tu navegador.

## Características

- **4 tipos de activos**: cuentas bancarias, acciones/ETFs, fondos indexados/monetarios y criptomonedas
- **Sin registro diario**: no necesitas apuntar ingresos y gastos cada mes — guarda una "captura" cuando quieras y el sistema traza tu evolución
- **Gráficas**: evolución histórica del patrimonio total y por categoría, donut de distribución actual
- **100% local**: todos los datos se guardan en `localStorage`, nada sale de tu navegador
- **PWA-ready**: funciona offline una vez cargado
- **Responsive**: funciona en móvil y escritorio

## Uso

Abre `index.html` en cualquier navegador moderno. No necesitas servidor.

```
git clone https://github.com/tu-usuario/wealthterm
cd wealthterm
# abre index.html en el navegador, o sirve con:
npx serve .
```

## Flujo recomendado

1. Ve a cada pestaña (**banco**, **bolsa**, **fondos**, **cripto**) y añade tus activos con cantidad y precio medio de compra
2. El patrimonio neto total se calcula automáticamente en tiempo real
3. Cada mes (o cuando quieras), ve a **historial** y pulsa "guardar captura ahora"
4. Las gráficas del **overview** mostrarán tu evolución a lo largo del tiempo

## Estructura

```
wealthterm/
├── index.html   — estructura HTML
├── style.css    — estilos (tema oscuro terminal)
├── app.js       — lógica y persistencia
└── README.md
```

## Datos

Todo se guarda en `localStorage` bajo la clave `wealthterm_v1`. Para exportar o hacer copia de seguridad, abre la consola del navegador y ejecuta:

```js
copy(localStorage.getItem('wealthterm_v1'))
```

Para restaurar:

```js
localStorage.setItem('wealthterm_v1', '<pega tu JSON aquí>')
location.reload()
```

## Licencia

MIT
