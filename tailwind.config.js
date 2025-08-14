/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/*.ejs',
    './public/**/*.js'
  ],
  safelist: [
    'container','mx-auto','px-5','py-10',
    'grid','sm:grid-cols-2','md:grid-cols-3','lg:grid-cols-4',
    'gap-2','gap-3','gap-4',
    'text-sm','text-base','text-lg','text-xl','text-2xl','text-3xl','text-4xl','font-bold',
    'rounded','rounded-lg','rounded-xl',
    'w-full','h-full',
    'min-h-[75svh]','min-h-[85svh]','place-items-center',
    'aspect-video',
    'btn','btn-primary','card'
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [
    require('@tailwindcss/aspect-ratio')  // si no lo tienes: npm i -D @tailwindcss/aspect-ratio
  ],
}
