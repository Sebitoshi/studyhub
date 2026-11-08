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
  /** Pista opcional: orienta sin dar la solución completa. */
  hint: string;
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
    hint: 'Ya tienes a y b leídos de la entrada: solo falta mostrar el resultado de combinarlos con el operador aritmético correcto.',
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
    hint: 'Arranca con el primer número como mayor y menor a la vez, y recorre el resto actualizando cada uno cuando el valor lo supere o quede por debajo.',
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
    hint: 'Convierte el texto a minúsculas y comprueba letra por letra si pertenece al conjunto "aeiou"; lleva un contador aparte.',
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
    hint: 'Ya tienes el bucle con i: concatena el texto con n, " x ", i, " = " y el producto n * i dentro de cada println.',
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
    hint: 'Basta con buscar divisores entre 2 y la raíz de n; si aparece uno, deja de buscar. Recuerda que 1 no es primo.',
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
    hint: 'Genera la versión invertida de la palabra y compárala con la original, ambas en el mismo tipo de letra.',
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
    hint: 'Necesitas dos variables con los dos últimos términos y una temporal para avanzar sin perder valores.',
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
    hint: 'Java ya trae una utilidad para ordenar un arreglo de enteros; después solo recórrelo e imprime cada valor.',
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
    hint: 'Para transponer, recorre las filas de salida con un índice y dentro imprime la columna correspondiente: intercambia los índices al acceder.',
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
    hint: 'Usa un mapa que respete el orden de inserción y divide la línea con un separador de espacios; suma uno por cada aparición.',
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
    id: 'java-par-impar',
    title: 'Par o impar',
    language: 'java',
    level: 'Básico',
    topic: 'Calentamiento',
    description: 'Lee un entero e imprime par si es divisible entre 2, o impar en caso contrario.',
    hint: 'El residuo de dividir entre 2 es 0 en los pares, también en los negativos.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: decide si n es par o impar
        System.out.println("par");`),
    tests: [
      test('Caso 1', '4', 'par'),
      test('Caso 2', '7', 'impar'),
      test('Caso 3', '0', 'par'),
      test('Caso 4', '-3', 'impar'),
    ],
  },
  {
    id: 'java-doble-o-triple',
    title: 'Doble o triple',
    language: 'java',
    level: 'Básico',
    topic: 'Calentamiento',
    description: 'Lee un entero: si es par imprime su doble; si es impar, su triple.',
    hint: 'Comprueba primero la paridad y elige una de las dos multiplicaciones.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: par → n * 2, impar → n * 3
        System.out.println(0);`),
    tests: [
      test('Caso 1', '3', '9'),
      test('Caso 2', '4', '8'),
      test('Caso 3', '1', '3'),
      test('Caso 4', '-2', '-4'),
    ],
  },
  {
    id: 'java-vocal-consonante',
    title: '¿Vocal o consonante?',
    language: 'java',
    level: 'Básico',
    topic: 'Calentamiento',
    description: 'Lee una letra e imprime vocal si es a, e, i, o, u (en mayúscula o minúscula); si no, consonante.',
    hint: 'Pasa la letra a minúsculas y comprueba si aparece dentro de "aeiou".',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        String letra = sc.next();
        // TODO: imprime "vocal" o "consonante"
        System.out.println("vocal");`),
    tests: [
      test('Caso 1', 'a', 'vocal'),
      test('Caso 2', 'E', 'vocal'),
      test('Caso 3', 'z', 'consonante'),
      test('Caso 4', 'M', 'consonante'),
    ],
  },
  {
    id: 'java-cerca-de-10',
    title: 'Cerca de 10',
    language: 'java',
    level: 'Básico',
    topic: 'Condicionales',
    description: 'Lee un entero e imprime si si está entre 8 y 12, ambos incluidos; si no, no.',
    hint: 'Necesitas dos comparaciones unidas con && (mayor o igual que 8 y menor o igual que 12).',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: imprime "si" si 8 <= n <= 12
        System.out.println("no");`),
    tests: [
      test('Caso 1', '9', 'si'),
      test('Caso 2', '12', 'si'),
      test('Caso 3', '13', 'no'),
      test('Caso 4', '7', 'no'),
    ],
  },
  {
    id: 'java-multiplo',
    title: '¿Es múltiplo?',
    language: 'java',
    level: 'Básico',
    topic: 'Condicionales',
    description: 'Lee dos enteros a y b e imprime si si a es múltiplo de b; en caso contrario, no. b nunca es 0.',
    hint: 'El residuo de a entre b es 0 exactamente cuando a es múltiplo de b.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        // TODO: decide si a es múltiplo de b
        System.out.println("no");`),
    tests: [
      test('Caso 1', '10 5', 'si'),
      test('Caso 2', '7 2', 'no'),
      test('Caso 3', '0 3', 'si'),
      test('Caso 4', '9 3', 'si'),
    ],
  },
  {
    id: 'java-mayor-de-tres',
    title: 'El mayor de tres',
    language: 'java',
    level: 'Básico',
    topic: 'Condicionales',
    description: 'Lee tres enteros e imprime el mayor de los tres.',
    hint: 'Puedes combinar Math.max dos veces o usar if/else encadenados.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        int c = sc.nextInt();
        // TODO: imprime el mayor de a, b y c
        System.out.println(a);`),
    tests: [
      test('Caso 1', '3 9 5', '9'),
      test('Caso 2', '-1 -7 -3', '-1'),
      test('Caso 3', '4 4 4', '4'),
    ],
  },
  {
    id: 'java-suma-digitos',
    title: 'Suma de dígitos',
    language: 'java',
    level: 'Intermedio',
    topic: 'Bucles',
    description: 'Lee un entero positivo e imprime la suma de sus dígitos.',
    hint: 'En cada vuelta toma el último dígito con % 10 y quítalo dividiendo entre 10.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: suma los dígitos de n
        System.out.println(0);`),
    tests: [
      test('Caso 1', '123', '6'),
      test('Caso 2', '9', '9'),
      test('Caso 3', '1000', '1'),
      test('Caso 4', '9875', '29'),
    ],
  },
  {
    id: 'java-invertir-numero',
    title: 'Invertir un número',
    language: 'java',
    level: 'Intermedio',
    topic: 'Bucles',
    description: 'Lee un entero positivo e imprime sus dígitos al revés, sin ceros a la izquierda: 1200 → 21.',
    hint: 'Acumula los dígitos en otro número: multiplica lo acumulado por 10 y suma el nuevo dígito.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: invierte los dígitos de n
        System.out.println(0);`),
    tests: [
      test('Caso 1', '123', '321'),
      test('Caso 2', '1200', '21'),
      test('Caso 3', '7', '7'),
    ],
  },
  {
    id: 'java-cuenta-atras',
    title: 'Cuenta atrás',
    language: 'java',
    level: 'Básico',
    topic: 'Bucles',
    description: 'Lee n e imprime los números de n hasta 1 en una sola línea, separados por un espacio.',
    hint: 'Usa un for descendente y evita el espacio sobrante al final.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: imprime n, n-1, ..., 1
        System.out.println(n);`),
    tests: [
      test('Caso 1', '3', '3 2 1'),
      test('Caso 2', '1', '1'),
      test('Caso 3', '5', '5 4 3 2 1'),
    ],
  },
  {
    id: 'java-triangulo',
    title: 'Triángulo de asteriscos',
    language: 'java',
    level: 'Intermedio',
    topic: 'Bucles',
    description: 'Lee n e imprime n líneas: la primera con un asterisco, la segunda con dos, y así hasta n.',
    hint: 'Dentro de cada línea repite el asterisco i veces; un bucle interno o String.repeat sirven.',
    starterCode: java(`        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        // TODO: imprime un asterisco, luego dos, ... hasta n
        for (int i = 1; i <= n; i++) {
            System.out.println();
        }`),
    tests: [
      test('Caso 1', '3', '*\n**\n***'),
      test('Caso 2', '1', '*'),
      test('Caso 3', '4', '*\n**\n***\n****'),
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
    hint: 'Separa el texto por cualquier espacio en blanco, convierte cada parte a número y acumula el total.',
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
    hint: 'Las cadenas de JavaScript se pueden partir en letras, invertir el arreglo y volver a unirlas.',
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
    hint: 'Evalúa primero el caso de múltiplo de ambos, porque 3 y 5 por separado ya cubren números que también son múltiplos del otro.',
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
  {
    id: 'js-par-impar',
    title: 'Par o impar',
    language: 'javascript',
    level: 'Básico',
    topic: 'Calentamiento',
    description: 'Lee un número entero e imprime par si es divisible entre 2, o impar en caso contrario.',
    hint: 'Con el residuo de dividir entre 2 sabes la respuesta; en los negativos impares no da 0.',
    starterCode: `${JS_PREAMBLE}\n// TODO: imprime "par" o "impar"\nconsole.log(entrada);\n`,
    tests: [
      test('Caso 1', '4', 'par'),
      test('Caso 2', '7', 'impar'),
      test('Caso 3', '0', 'par'),
    ],
  },
  {
    id: 'js-mayor-tres',
    title: 'El mayor de tres',
    language: 'javascript',
    level: 'Básico',
    topic: 'Calentamiento',
    description: 'Lee tres números separados por espacios e imprime el mayor.',
    hint: 'Separa la entrada, conviértela a números y compara; Math.max acepta varios argumentos.',
    starterCode: `${JS_PREAMBLE}\n// TODO: imprime el mayor de los tres números\nconsole.log(entrada);\n`,
    tests: [
      test('Caso 1', '3 9 5', '9'),
      test('Caso 2', '-1 -2 -3', '-1'),
      test('Caso 3', '7 7 7', '7'),
    ],
  },
  {
    id: 'js-suma-digitos',
    title: 'Suma de dígitos',
    language: 'javascript',
    level: 'Intermedio',
    topic: 'Bucles',
    description: 'Lee un entero positivo e imprime la suma de sus dígitos.',
    hint: 'Convierte el número a texto y recorre sus caracteres sumando cada uno como número.',
    starterCode: `${JS_PREAMBLE}\n// TODO: suma los dígitos de la entrada\nconsole.log(entrada);\n`,
    tests: [
      test('Caso 1', '123', '6'),
      test('Caso 2', '1000', '1'),
      test('Caso 3', '42', '6'),
    ],
  },
];
