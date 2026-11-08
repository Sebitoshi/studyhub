import type { SandboxLanguage, SandboxTest } from './sandbox.service';

export type SandboxLevel = 'Básico' | 'Intermedio' | 'Avanzado';

/** Ejercicio del banco: listo para resolver, con código inicial y casos. */
export interface BankExercise {
  id: string;
  title: string;
  language: SandboxLanguage;
  level: SandboxLevel;
  topic: string;
  description: string;
  starterCode: string;
  tests: SandboxTest[];
}

const test = (label: string, stdin: string, expected: string): SandboxTest => ({
  id: `t${Math.abs(hash(label + stdin))}`,
  label,
  stdin,
  expected,
});

/** Id estable para cada caso (el editor usa ids de texto). */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return h;
}

const java = (body: string): string => `import java.util.Scanner;

public class prog {
    public static void main(String[] args) {
${body}
    }
}
`;

const JS_PREAMBLE = `// La entrada completa llega por stdin: usa esta variable.
const entrada = require('fs').readFileSync(0, 'utf8').trim();
`;

/**
 * Banco de ejercicios de práctica. Todos son de nuestra autoría y están
 * pensados para el sandbox: leen de stdin e imprimen una salida determinista.
 */
export const EXERCISE_BANK: BankExercise[] = [
  {
    id: 'java-suma',
    title: 'Suma de dos enteros',
    language: 'java',
    level: 'Básico',
    topic: 'Entrada y salida',
    description:
      'Lee dos enteros separados por un espacio y muestra su suma en una sola línea.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        // TODO: imprime la suma de a y b
        System.out.println(0);`),
    tests: [
      test('Caso 1', '3 4', '7'),
      test('Caso 2', '-5 12', '7'),
      test('Caso 3', '100 250', '350'),
    ],
  },
  {
    id: 'java-max-min',
    title: 'Mayor y menor',
    language: 'java',
    level: 'Básico',
    topic: 'Bucles',
    description:
      'La primera línea trae la cantidad n; la segunda, n enteros. Imprime el mayor y el menor separados por un espacio.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: lee n números y guarda el mayor y el menor
        System.out.println("0 0");`),
    tests: [
      test('Caso 1', '5\n3 9 2 7 4', '9 2'),
      test('Caso 2', '3\n-1 -7 -3', '-1 -7'),
      test('Caso 3', '1\n42', '42 42'),
    ],
  },
  {
    id: 'java-vocales',
    title: 'Contar vocales',
    language: 'java',
    level: 'Básico',
    topic: 'Cadenas',
    description:
      'Lee una línea de texto e imprime cuántas vocales contiene (a, e, i, o, u, sin importar mayúsculas o minúsculas).',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        String texto = sc.nextLine();
        // TODO: recorre el texto y cuenta las vocales
        System.out.println(0);`),
    tests: [
      test('Caso 1', 'Hola Mundo', '4'),
      test('Caso 2', 'AEIOU', '5'),
      test('Caso 3', 'xyz', '0'),
    ],
  },
  {
    id: 'java-tabla',
    title: 'Tabla de multiplicar',
    language: 'java',
    level: 'Básico',
    topic: 'Bucles',
    description:
      'Lee un entero n e imprime su tabla del 1 al 10, una línea por operación con el formato exacto: n x i = resultado.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: imprime "n x i = n*i" para i de 1 a 10
        for (int i = 1; i <= 10; i++) {
            System.out.println("TODO");
        }`),
    tests: [
      test(
        'Tabla del 3',
        '3',
        '3 x 1 = 3\n3 x 2 = 6\n3 x 3 = 9\n3 x 4 = 12\n3 x 5 = 15\n3 x 6 = 18\n3 x 7 = 21\n3 x 8 = 24\n3 x 9 = 27\n3 x 10 = 30',
      ),
      test(
        'Tabla del 5',
        '5',
        '5 x 1 = 5\n5 x 2 = 10\n5 x 3 = 15\n5 x 4 = 20\n5 x 5 = 25\n5 x 6 = 30\n5 x 7 = 35\n5 x 8 = 40\n5 x 9 = 45\n5 x 10 = 50',
      ),
    ],
  },
  {
    id: 'java-primo',
    title: '¿Es primo?',
    language: 'java',
    level: 'Intermedio',
    topic: 'Algoritmos',
    description:
      'Lee un entero positivo n e imprime primo si es número primo, o no primo en caso contrario.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: decide si n es primo (recuerda que 1 no lo es)
        System.out.println("no primo");`),
    tests: [
      test('Caso 1', '2', 'primo'),
      test('Caso 2', '1', 'no primo'),
      test('Caso 3', '97', 'primo'),
      test('Caso 4', '100', 'no primo'),
    ],
  },
  {
    id: 'java-palindromo',
    title: 'Palíndromo',
    language: 'java',
    level: 'Intermedio',
    topic: 'Cadenas',
    description:
      'Lee una palabra (sin espacios) e imprime si se lee igual al derecho y al revés, o no. Ignora mayúsculas y minúsculas.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        String palabra = sc.nextLine();
        // TODO: compara la palabra con su versión invertida
        System.out.println("no");`),
    tests: [
      test('Caso 1', 'reconocer', 'si'),
      test('Caso 2', 'Hola', 'no'),
      test('Caso 3', 'Ana', 'si'),
      test('Caso 4', 'a', 'si'),
    ],
  },
  {
    id: 'java-fibonacci',
    title: 'Primeros n de Fibonacci',
    language: 'java',
    level: 'Intermedio',
    topic: 'Bucles',
    description:
      'Lee n e imprime los primeros n términos de la sucesión de Fibonacci empezando en 0, separados por un espacio.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: imprime 0 1 1 2 3 ... hasta n términos
        System.out.println(0);`),
    tests: [
      test('Caso 1', '5', '0 1 1 2 3'),
      test('Caso 2', '1', '0'),
      test('Caso 3', '8', '0 1 1 2 3 5 8 13'),
    ],
  },
  {
    id: 'java-ordenar',
    title: 'Ordenar una lista',
    language: 'java',
    level: 'Intermedio',
    topic: 'Arreglos',
    description:
      'Lee n y luego n enteros. Imprime los números ordenados de menor a mayor, separados por un espacio.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] numeros = new int[n];
        for (int i = 0; i < n; i++) {
            numeros[i] = sc.nextInt();
        }
        // TODO: ordena el arreglo y muéstralo
        System.out.println();`),
    tests: [
      test('Caso 1', '5\n5 1 4 2 3', '1 2 3 4 5'),
      test('Caso 2', '4\n10 -2 7 7', '-2 7 7 10'),
    ],
  },
  {
    id: 'java-transpuesta',
    title: 'Matriz transpuesta',
    language: 'java',
    level: 'Avanzado',
    topic: 'Matrices',
    description:
      'Lee n y después n×n enteros por filas. Imprime la matriz transpuesta: n líneas con n números separados por espacios.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[][] matriz = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                matriz[i][j] = sc.nextInt();
            }
        }
        // TODO: imprime la transpuesta (filas y columnas intercambiadas)
        System.out.println();`),
    tests: [
      test('Caso 1', '2\n1 2 3 4', '1 3\n2 4'),
      test('Caso 2', '3\n1 2 3 4 5 6 7 8 9', '1 4 7\n2 5 8\n3 6 9'),
    ],
  },
  {
    id: 'java-frecuencia',
    title: 'Frecuencia de palabras',
    language: 'java',
    level: 'Avanzado',
    topic: 'Colecciones',
    description:
      'Lee una línea con palabras separadas por espacios e imprime cada palabra distinta con su frecuencia, en el orden en que aparece por primera vez, con el formato palabra n.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        String linea = sc.nextLine();
        // TODO: usa un Map para contar y respeta el orden de aparición
        System.out.println(linea);`),
    tests: [
      test('Caso 1', 'hola mundo hola', 'hola 2\nmundo 1'),
      test('Caso 2', 'java java java', 'java 3'),
      test('Caso 3', 'uno dos tres', 'uno 1\ndos 1\ntres 1'),
    ],
  },
  {
    id: 'js-suma-total',
    title: 'Sumar todos los números',
    language: 'javascript',
    level: 'Básico',
    topic: 'Entrada y salida',
    description:
      'La entrada trae números separados por espacios (o saltos de línea). Imprime la suma total.',
    starterCode: `${JS_PREAMBLE}
// TODO: separa los números, súmalos e imprime el total
console.log(entrada);
`,
    tests: [
      test('Caso 1', '3 4', '7'),
      test('Caso 2', '1 2 3 4', '10'),
      test('Caso 3', '10\n20\n30', '60'),
    ],
  },
  {
    id: 'js-invertir',
    title: 'Invertir una palabra',
    language: 'javascript',
    level: 'Básico',
    topic: 'Cadenas',
    description: 'Lee una palabra e imprime sus letras en orden inverso.',
    starterCode: `${JS_PREAMBLE}
// TODO: imprime la palabra al revés
console.log(entrada);
`,
    tests: [
      test('Caso 1', 'hola', 'aloh'),
      test('Caso 2', 'StudyHub', 'buHydutS'),
    ],
  },
  {
    id: 'js-fizzbuzz',
    title: 'Fizz, Buzz y FizzBuzz',
    language: 'javascript',
    level: 'Intermedio',
    topic: 'Bucles',
    description:
      'Lee n e imprime del 1 al n, uno por línea: Fizz si es múltiplo de 3, Buzz si es múltiplo de 5, FizzBuzz si es múltiplo de ambos y el número en otro caso.',
    starterCode: `${JS_PREAMBLE}
const n = Number(entrada);
// TODO: recorre del 1 al n aplicando las reglas
console.log(n);
`,
    tests: [
      test('Caso 1', '5', '1\n2\nFizz\n4\nBuzz'),
      test('Caso 2', '3', '1\n2\nFizz'),
      test(
        'Caso 3',
        '15',
        '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz',
      ),
    ],
  },
];
