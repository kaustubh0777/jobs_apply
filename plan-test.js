import { fileURLToPath } from 'url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('direct')
} else {
  console.log('imported')
}
