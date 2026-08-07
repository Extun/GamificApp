# ============================================================
# GamificApp — Empaquetado de la distribución local para Windows
# (Fase Local 2.3).
#
# Produce una carpeta lista para comprimir y entregar, con TODO lo necesario
# para que el revisor haga:
#     extraer  ->  Instalar GamificApp.cmd  ->  Iniciar GamificApp.cmd
# sin instalar Node, MySQL, npm, Docker ni herramientas de desarrollo, y sin
# necesitar conexión a internet.
#
# NO se ejecuta en el equipo del revisor: es una herramienta de preparación.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
#   ... -Salida "D:\entrega\GamificApp"     (por defecto: release\GamificApp)
#   ... -Zip                                 (genera además el .zip)
#   ... -SaltarBuild                         (reutiliza dist\ tal cual)
#   ... -SinDependencias                     (no incluye node_modules)
#
# ------------------------------------------------------------
# QUÉ VIAJA, QUÉ SE GENERA Y QUÉ NO SALE DE AQUÍ
# ------------------------------------------------------------
#   VIAJA EN EL PAQUETE
#     · los 4 .cmd de doble clic e instalador\
#     · runtime\node  (Node v22.23.1 portable) y runtime\mysql (MySQL 8.0.44
#       portable, podado — ver $PodaMySql)
#     · código fuente del frontend (src, public, index.html, vite.config.js)
#       y del backend (server\, sin .env ni node_modules)
#     · database\ (esquema base + migraciones documentadas)
#     · dist\ (build de producción del frontend, ya construido)
#     · node_modules de la raíz y de server\ (salvo -SinDependencias): así la
#       instalación NO necesita internet ni el registro de npm
#
#   SE GENERA AL INSTALAR, EN EL EQUIPO DEL REVISOR
#     · server\.env con credenciales aleatorias e irrepetibles
#     · CREDENCIALES.txt, logs\, .run\
#     · dist\ se reconstruye con npm run build
#
#   VIVE EN %LOCALAPPDATA%\GamificApp  (NUNCA dentro del paquete)
#     · mysql\datos  — el trabajo de la escuela
#     · mysql\my.ini, mysql\error.log, mysql\mysqld.pid
#     · secretos\root.txt e instancia.json
#
#   NO SE DISTRIBUYE JAMÁS
#     · server\.env, CREDENCIALES.txt, .run\, logs\, server\backups\
#     · runtime\descargas\ (los ZIP de origen, 233 MB de redundancia)
#     · .git\, docs\ internos, CONTRIBUTING.md/START_HERE.md y la
#       configuración local del editor (contienen rutas y detalles del
#       equipo de desarrollo)
#     · README.md — documentación del repositorio; sus enlaces apuntan a
#       archivos que no viajan. Para el revisor está LEEME.txt.
# ============================================================
param(
    [string]$Salida = '',
    [switch]$Zip,
    [switch]$SaltarBuild,
    [switch]$SinDependencias
)

. (Join-Path $PSScriptRoot 'comun.ps1')
. (Join-Path $PSScriptRoot 'runtime.ps1')
. (Join-Path $PSScriptRoot 'mysql.ps1')

Iniciar-Registro 'empaquetar'
Escribir-Titulo 'GamificApp — Empaquetado de la distribucion'

$cronometro = [System.Diagnostics.Stopwatch]::StartNew()

# ------------------------------------------------------------
# MANIFIESTO — declarado como datos, para poder auditarlo de un vistazo
# ------------------------------------------------------------
# Carpetas que se copian enteras (con las exclusiones indicadas).
$CarpetasDelPaquete = @(
    # instalador: sin empaquetar.ps1. Este script es una herramienta de
    # preparación del equipo de desarrollo; el revisor no lo ejecuta nunca y
    # no tiene por qué recibirlo.
    @{ Ruta = 'instalador'; XD = @(); XF = @('empaquetar.ps1') },
    @{ Ruta = 'src';        XD = @(); XF = @() },
    @{ Ruta = 'public';     XD = @(); XF = @() },
    @{ Ruta = 'database';   XD = @(); XF = @() },
    @{ Ruta = 'dist';       XD = @(); XF = @() },
    # server: sin node_modules (se copia aparte si procede), sin el .env real,
    # sin los respaldos del sistema RESET —que son datos de verdad— y sin
    # .env.development.example, que es la plantilla del MySQL de Docker: solo
    # sirve para desarrollo y sus credenciales ficticias no pintan nada en una
    # distribución.
    @{ Ruta = 'server';     XD = @('node_modules', 'backups'); XF = @('.env', '.env.development.example') }
)

# Archivos sueltos de la raíz.
#
# README.md NO viaja a propósito: es documentación del REPOSITORIO, escrita
# para quien desarrolla. Remite a `CONTRIBUTING.md`, `START_HERE.md` y `docs/`,
# que se excluyen deliberadamente del paquete, así que dentro de la distribución
# sus enlaces quedarían rotos y explicaría un flujo (build manual, npm,
# Docker) que el revisor no necesita. Su equivalente para quien recibe el
# paquete es `LEEME.txt`, que se genera más abajo y es autosuficiente.
$ArchivosDelPaquete = @(
    'Instalar GamificApp.cmd',
    'Iniciar GamificApp.cmd',
    'Detener GamificApp.cmd',
    'Configurar GamificApp.cmd',
    'index.html',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    'eslint.config.js',
    '.env.example'
)

# ------------------------------------------------------------
# PODA DE runtime\mysql — SOLO lo demostrado prescindible
# ------------------------------------------------------------
# Regla de oro de esta fase: FIABILIDAD > TAMAÑO. No se quita nada "porque
# parezca innecesario": cada regla tiene una demostración detrás.
#
#   *.pdb              Símbolos de depuración. El cargador de Windows NUNCA
#                      los abre; solo los lee un depurador conectado al
#                      proceso. 446,7 MB en 35 archivos.
#   *.lib              Bibliotecas de importación/estáticas. Sirven para
#                      COMPILAR programas en C contra MySQL, no para
#                      ejecutarlo. 55,1 MB en 7 archivos.
#   *-debug.dll        Compilaciones de depuración. Su tabla de importaciones
#                      PE pide msvcp140d.dll, vcruntime140d.dll,
#                      vcruntime140_1d.dll y ucrtbased.dll — el CRT de
#                      DEPURACIÓN de Visual Studio, que Microsoft no
#                      redistribuye y que no existe en ninguna máquina sin
#                      Visual Studio instalado: no pueden cargar en ningún
#                      sitio. Y mysqld.exe importa la versión de publicación
#                      (libprotobuf-lite.dll), no la de depuración.
#   lib\plugin\debug   Lo mismo, para los 30 plugins: 30 .dll de depuración
#                      (mismo CRT inexistente) + sus 30 .pdb.
#   include            Cabeceras .h/.c del API de C de MySQL. Material de
#                      compilación.
#
# SE CONSERVA TODO LO DEMÁS, incluido lo que hoy no usamos: los 28 ejecutables
# cliente, lib\mecab (diccionario del analizador japonés), lib\plugin
# completo, lib\private (datos ICU del motor de expresiones regulares),
# share\ entero (charsets, collations y los mensajes de error en los 25
# idiomas) y todas las DLL. Decisión explícita de Fabrizio: no se elimina
# nada cuya necesidad no esté demostrada.
$PodaMySql = @{
    Extensiones = @('.pdb', '.lib')
    Patrones    = @('*-debug.dll')
    Carpetas    = @('lib\plugin\debug', 'include')
}

# ------------------------------------------------------------
# AUDITORÍA — artefactos que NO pueden aparecer en el paquete
# ------------------------------------------------------------
$NombresProhibidos = @(
    '.env', 'CREDENCIALES.txt', 'root.txt', 'instancia.json', 'preferencias.json',
    'my.ini', 'mysqld.pid', 'backend.json', 'frontend.json', 'env-anterior-docker.bak'
)
# CREDENCIALES.txt.nuevo es el temporal del reemplazo atomico de ese archivo:
# lleva los mismos secretos y un corte de luz en el peor instante lo deja en
# disco. Que la auditoria lo pare aunque nadie lo haya limpiado.
$PatronesProhibidos = @('*.pid', '*.log', 'CREDENCIALES.txt.*')

# ------------------------------------------------------------
# Utilidades
# ------------------------------------------------------------
function Formatear-Tamano {
    param([double]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N1} KB' -f ($Bytes / 1KB)) }
    return ('{0:N0} B' -f $Bytes)
}

function Medir-Carpeta {
    # -Excluir sirve para que el inventario no cuente dos veces lo mismo: por
    # ejemplo server\node_modules, que tiene su propia línea.
    param([string]$Ruta, [string]$Excluir = '')
    if (-not (Test-Path $Ruta)) { return [pscustomobject]@{ Bytes = 0; Archivos = 0 } }
    $archivos = @(Get-ChildItem -Path $Ruta -Recurse -File -Force -ErrorAction SilentlyContinue)
    if ($Excluir) {
        $prefijo = (Join-Path $Ruta $Excluir) + '\'
        $archivos = @($archivos | Where-Object { -not $_.FullName.StartsWith($prefijo, 'OrdinalIgnoreCase') })
    }
    $m = $archivos | Measure-Object -Property Length -Sum
    return [pscustomobject]@{
        Bytes    = $(if ($m.Sum) { [double]$m.Sum } else { 0 })
        Archivos = $m.Count
    }
}

# robocopy en vez de Copy-Item: con node_modules (más de 54.000 archivos) la
# diferencia es de minutos, y además soporta rutas largas sin tropezar.
function Copiar-Arbol {
    param(
        [string]$Origen,
        [string]$Destino,
        [string[]]$ExcluirCarpetas = @(),
        [string[]]$ExcluirArchivos = @()
    )
    # /MT:8 y no mas. Se intento subirlo a 16 y a 32 para acelerar y NO se pudo
    # demostrar ninguna mejora: copiando node_modules (54.549 archivos) las
    # medidas salieron 28,6 s con 8 hilos, 25,8 s con 16, 16,9 s con 32... y
    # 16,9 s otra vez con 8. Lo que se estaba midiendo era la cache del sistema
    # de archivos calentandose, no los hilos.
    #
    # Y aunque ayudase, apenas importaria: el copiado entero son ~42 s de los
    # ~507 s del empaquetado. El 92% del tiempo es comprimir el ZIP. Si alguien
    # vuelve por aqui buscando velocidad, el sitio no es este.
    $argumentos = @($Origen, $Destino, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1', '/MT:8')
    if ($ExcluirCarpetas.Count -gt 0) { $argumentos += '/XD'; $argumentos += $ExcluirCarpetas }
    if ($ExcluirArchivos.Count -gt 0) { $argumentos += '/XF'; $argumentos += $ExcluirArchivos }
    & robocopy @argumentos | Out-Null
    # robocopy usa los códigos 0-7 para "todo bien" (1 = se copiaron archivos).
    # Solo 8 o más es un fallo real.
    $codigo = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($codigo -ge 8) {
        Terminar-Con-Error "Fallo la copia de $Origen (robocopy devolvio $codigo)." @(
            "Destino: $Destino",
            'Causas habituales: no queda espacio en disco, o un antivirus bloquea la escritura.'
        )
    }
}

# ------------------------------------------------------------
# 1. Comprobaciones previas
# ------------------------------------------------------------
Escribir-Paso 'Comprobando que este equipo puede armar la distribucion'
Comprobar-Requisitos-Node

if (-not (Test-Path $script:NodePortableExe)) {
    Terminar-Con-Error 'Falta el Node portable que debe viajar en el paquete.' @(
        "Se esperaba: $script:NodePortableExe",
        '',
        'Que hacer:',
        '  powershell -NoProfile -ExecutionPolicy Bypass -File instalador\instalar.ps1 -PrepararRuntimeNode'
    )
}
if (-not (Test-MySqlPortableDisponible)) {
    Terminar-Con-Error 'Falta el MySQL portable que debe viajar en el paquete.' @(
        "Se esperaba: $script:MySqldExe",
        '',
        'Extrae el ZIP oficial de MySQL 8.0.44 win-x64 en runtime\mysql y repite.'
    )
}
$versionMySql = Obtener-VersionMySqlPortable
$versionNode  = (Obtener-Node).Texto
Escribir-Ok "Runtimes presentes: Node $versionNode  ·  MySQL $versionMySql."

# ------------------------------------------------------------
# 2. Runtime de Visual C++ junto a MySQL (app-local)
# ------------------------------------------------------------
# Sin esto el paquete solo funcionaría en equipos que ya tuvieran instalado
# el Visual C++ Redistributable. Ver la explicación larga en runtime.ps1.
Preparar-VcRuntimeParaMySql -CarpetaBinMySql (Split-Path -Parent $script:MySqldExe)

# ------------------------------------------------------------
# 3. Dependencias y build
# ------------------------------------------------------------
$modulosRaiz   = Join-Path $script:Raiz 'node_modules'
$modulosServer = Join-Path $script:CarpetaServer 'node_modules'
if (-not $SinDependencias) {
    foreach ($par in @(@($modulosRaiz, 'frontend'), @($modulosServer, 'servidor'))) {
        if (-not (Test-Path $par[0])) {
            Terminar-Con-Error "Faltan las dependencias de $($par[1]) que deben viajar en el paquete." @(
                "Se esperaban en: $($par[0])",
                '',
                'Que hacer: ejecuta "Instalar GamificApp.cmd" una vez, o usa -SinDependencias',
                'para armar un paquete que las descargue en el equipo de destino.'
            )
        }
    }
}

if (-not $SaltarBuild) {
    Escribir-Paso 'Construyendo la pagina web (npm run build)'
    $salidaBuild  = Join-Path $script:CarpetaLogs 'build-paquete.log'
    $erroresBuild = Join-Path $script:CarpetaLogs 'build-paquete-errores.log'
    $codigo = Invocar-Npm -Argumentos @('run', 'build') -Carpeta $script:Raiz `
        -LogSalida $salidaBuild -LogErrores $erroresBuild
    if ($codigo -ne 0) {
        Mostrar-ColaLog -Ruta $erroresBuild -Lineas 20
        Terminar-Con-Error 'Fallo la construccion de la pagina web: no se empaqueta nada.' @(
            "Detalle completo en: $erroresBuild"
        )
    }
    Escribir-Ok 'Pagina web construida.'
} else {
    Escribir-Aviso 'Se reutiliza dist\ tal cual (-SaltarBuild).'
}
if (-not (Test-Path (Join-Path $script:Raiz 'dist\index.html'))) {
    Terminar-Con-Error 'No existe dist\index.html: el paquete quedaria sin pagina web.' @(
        'Ejecuta el empaquetado sin -SaltarBuild.'
    )
}

# ------------------------------------------------------------
# 4. Carpeta de salida (limpieza SEGURA)
# ------------------------------------------------------------
if ($Salida -eq '') { $Salida = Join-Path $script:Raiz 'release\GamificApp' }
$Salida = [System.IO.Path]::GetFullPath($Salida)
$marcaPaquete = Join-Path $Salida 'PAQUETE.json'

Escribir-Paso "Preparando la carpeta de salida"
Escribir-Detalle $Salida

# Nunca dentro del propio proyecto (se copiaría a sí mismo), y nunca sobre
# una carpeta que no haya creado este script.
if ($Salida -eq $script:Raiz -or $Salida.StartsWith($script:Raiz + '\src', 'OrdinalIgnoreCase') -or
    $Salida.StartsWith($script:Raiz + '\server', 'OrdinalIgnoreCase') -or
    $Salida.StartsWith($script:Raiz + '\runtime', 'OrdinalIgnoreCase')) {
    Terminar-Con-Error 'La carpeta de salida no puede estar dentro del codigo del proyecto.' @(
        "Salida indicada: $Salida"
    )
}
if (Test-Path $Salida) {
    if (-not (Test-Path $marcaPaquete)) {
        Terminar-Con-Error 'La carpeta de salida ya existe y NO la creo este empaquetador.' @(
            "Carpeta: $Salida",
            "No se encontro la marca $((Split-Path -Leaf $marcaPaquete)), asi que no se borra nada.",
            '',
            'Que hacer: borrala tu mismo si de verdad sobra, o indica otra con -Salida.'
        )
    }
    Escribir-Detalle 'Se elimina el paquete anterior (tiene la marca de este empaquetador).'
    Remove-Item -Path $Salida -Recurse -Force
}
New-Item -ItemType Directory -Path $Salida -Force | Out-Null
# La marca se escribe YA, no al final: si el empaquetado se interrumpe (por
# ejemplo porque la auditoria encuentra algo), la carpeta queda igualmente
# identificada como creada por este script y el siguiente intento puede
# limpiarla sin pedir permiso. Al terminar se reescribe con los metadatos
# completos.
'{ "producto": "GamificApp", "estado": "incompleto" }' |
    Out-File -FilePath $marcaPaquete -Encoding utf8

# ------------------------------------------------------------
# 5. Copia del código y de los recursos
# ------------------------------------------------------------
Escribir-Paso 'Copiando el codigo de GamificApp'
foreach ($carpeta in $CarpetasDelPaquete) {
    $origen = Join-Path $script:Raiz $carpeta.Ruta
    if (-not (Test-Path $origen)) {
        Terminar-Con-Error "Falta la carpeta '$($carpeta.Ruta)' en el proyecto." @(
            'La copia del repositorio esta incompleta.'
        )
    }
    Copiar-Arbol -Origen $origen -Destino (Join-Path $Salida $carpeta.Ruta) `
        -ExcluirCarpetas $carpeta.XD -ExcluirArchivos $carpeta.XF
    $m = Medir-Carpeta (Join-Path $Salida $carpeta.Ruta)
    Escribir-Detalle ("{0,-12} {1,10}  {2,6} archivos" -f $carpeta.Ruta, (Formatear-Tamano $m.Bytes), $m.Archivos)
}
foreach ($archivo in $ArchivosDelPaquete) {
    $origen = Join-Path $script:Raiz $archivo
    if (-not (Test-Path $origen)) {
        Terminar-Con-Error "Falta el archivo '$archivo' en el proyecto." @(
            'La copia del repositorio esta incompleta.'
        )
    }
    # Copy-Item copia los bytes tal cual: los .cmd conservan sus finales CRLF
    # y los .ps1 su BOM UTF-8, que son imprescindibles en Windows.
    Copy-Item -Path $origen -Destination (Join-Path $Salida $archivo) -Force
}
Escribir-Ok "Codigo copiado ($($ArchivosDelPaquete.Count) archivos de la raiz)."

# ------------------------------------------------------------
# 6. Dependencias ya instaladas (para no necesitar internet)
# ------------------------------------------------------------
if (-not $SinDependencias) {
    Escribir-Paso 'Copiando las dependencias ya instaladas (node_modules)'
    Escribir-Detalle 'Son decenas de miles de archivos: tarda un par de minutos.'
    Copiar-Arbol -Origen $modulosRaiz   -Destino (Join-Path $Salida 'node_modules')
    Copiar-Arbol -Origen $modulosServer -Destino (Join-Path $Salida 'server\node_modules')

    # Marcador que lee Instalar-Dependencias para saltarse 'npm ci': el
    # SHA-256 del package-lock.json con el que se instalaron.
    foreach ($par in @(@($script:Raiz, 'frontend'), @($script:CarpetaServer, 'servidor'))) {
        $huella = (Get-FileHash -Path (Join-Path $par[0] 'package-lock.json') -Algorithm SHA256).Hash
        $huella | Out-File -FilePath (Join-Path $Salida "instalador\dependencias-$($par[1]).sha256") -Encoding utf8
    }
    $mr = Medir-Carpeta (Join-Path $Salida 'node_modules')
    $ms = Medir-Carpeta (Join-Path $Salida 'server\node_modules')
    Escribir-Ok ("Dependencias incluidas: frontend {0} ({1} arch) y servidor {2} ({3} arch)." -f `
        (Formatear-Tamano $mr.Bytes), $mr.Archivos, (Formatear-Tamano $ms.Bytes), $ms.Archivos)
    Escribir-Detalle 'La instalacion en el equipo de destino no necesitara internet.'
} else {
    Escribir-Aviso 'Sin node_modules (-SinDependencias): la instalacion necesitara internet.'
}

# ------------------------------------------------------------
# 7. Runtimes portables
# ------------------------------------------------------------
Escribir-Paso 'Copiando Node.js portable'
Copiar-Arbol -Origen $script:CarpetaNode -Destino (Join-Path $Salida 'runtime\node')
$mNode = Medir-Carpeta (Join-Path $Salida 'runtime\node')
Escribir-Ok ("Node $versionNode incluido: {0} ({1} archivos)." -f (Formatear-Tamano $mNode.Bytes), $mNode.Archivos)

Escribir-Paso 'Copiando MySQL portable (con la poda demostrada)'
$origenMySql = $script:CarpetaMySqlRuntime
$destinoMySql = Join-Path $Salida 'runtime\mysql'

# Se calcula la poda ANTES de copiar, para poder informar exactamente de qué
# se queda fuera y comprobar después que la copia coincide.
$todosMySql = @(Get-ChildItem -Path $origenMySql -Recurse -File -Force)
$podados = @($todosMySql | Where-Object {
    $relativa = $_.FullName.Substring($origenMySql.Length + 1)
    $fuera = $false
    if ($PodaMySql.Extensiones -contains $_.Extension.ToLower()) { $fuera = $true }
    foreach ($patron in $PodaMySql.Patrones) { if ($_.Name -like $patron) { $fuera = $true } }
    foreach ($carpeta in $PodaMySql.Carpetas) { if ($relativa -like "$carpeta\*") { $fuera = $true } }
    $fuera
})
$bytesOriginal = ($todosMySql | Measure-Object -Property Length -Sum).Sum
$bytesPodados  = $(if ($podados.Count -gt 0) { ($podados | Measure-Object -Property Length -Sum).Sum } else { 0 })

$excluirArchivos = @()
$excluirArchivos += ($PodaMySql.Extensiones | ForEach-Object { "*$_" })
$excluirArchivos += $PodaMySql.Patrones
$excluirCarpetas = $PodaMySql.Carpetas | ForEach-Object { Join-Path $origenMySql $_ }
Copiar-Arbol -Origen $origenMySql -Destino $destinoMySql `
    -ExcluirCarpetas $excluirCarpetas -ExcluirArchivos $excluirArchivos

$mMySql = Medir-Carpeta $destinoMySql
$esperados = $todosMySql.Count - $podados.Count
if ($mMySql.Archivos -ne $esperados) {
    Terminar-Con-Error 'La poda de MySQL no dejo el numero de archivos esperado.' @(
        "Esperados: $esperados    ·    Copiados: $($mMySql.Archivos)",
        'No se continua: un paquete de base de datos incompleto es peor que uno grande.'
    )
}
Escribir-Ok ("MySQL $versionMySql incluido: {0} -> {1} ({2} archivos eliminados, {3} liberados)." -f `
    (Formatear-Tamano $bytesOriginal), (Formatear-Tamano $mMySql.Bytes), $podados.Count, (Formatear-Tamano $bytesPodados))

# Comprobación de que el runtime de Visual C++ llegó al paquete: es la
# diferencia entre funcionar o no en un Windows sin Visual C++ instalado.
foreach ($dll in $script:VcRuntimeDlls) {
    if (-not (Test-Path (Join-Path $destinoMySql "bin\$dll"))) {
        Terminar-Con-Error "El paquete quedo sin $dll junto a MySQL." @(
            'Sin ese archivo la base de datos no arranca en un Windows recien instalado.'
        )
    }
}
Escribir-Detalle "Runtime de Visual C++ presente junto a mysqld.exe ($($script:VcRuntimeDlls -join ', '))."

# ------------------------------------------------------------
# 8. Documento para quien recibe el paquete
# ------------------------------------------------------------
Escribir-Paso 'Escribiendo la guia de uso (LEEME.txt)'
$leeme = @"
GamificApp — Instalación en tu computadora
==========================================

Qué necesitas: una computadora con Windows 10 u 11 de 64 bits.
NO hace falta instalar Node.js, MySQL, npm, Docker ni ningún programa de
desarrollo: GamificApp trae todo lo que necesita dentro de esta carpeta.


PASOS
-----

  1. Descomprime esta carpeta donde prefieras (por ejemplo, en el Escritorio).
     Descomprímela ENTERA: no abras los archivos desde dentro del ZIP.

  2. Haz doble clic en   Instalar GamificApp.cmd
     Tarda unos minutos la primera vez. Es normal que Windows pregunte si
     permites la ejecución.

     Te hará tres preguntas. En las tres, pulsar Enter significa "no":
     nada opcional ocurre sin que tú lo pidas.

         ¿Deseas cargar datos de demostración?  [s/N]

     Responde  s  y GamificApp creará un docente, cuatro estudiantes y una
     actividad de cada juego para que puedas probarla enseguida. Son datos
     FICTICIOS: no pertenecen a ninguna escuela real. Responde  n  (o pulsa
     Enter) para empezar con la aplicación vacía. En ningún caso se escribe
     encima de datos que ya existan.

         ¿Permitir el acceso desde otros dispositivos de la red?  [s/N]

     Responde  s  si quieres que este equipo haga de servidor y que las
     tablets, teléfonos y portátiles conectados a la MISMA red puedan usar
     GamificApp desde su navegador, sin instalar nada. Este equipo tendrá que
     quedarse encendido mientras se use. Ver más abajo.

         ¿Iniciar GamificApp automáticamente?  [s/N]

     Responde  s  y GamificApp se abrirá sola cada vez que inicies sesión en
     Windows en este equipo.

     Las tres preguntas solo salen en la primera instalación. Las dos últimas
     se pueden cambiar cuando quieras con  Configurar GamificApp.cmd

  3. Al terminar, GamificApp se abre sola en el navegador.
     Si no se abriera, entra tú a:   http://localhost:5173

  4. Los días siguientes, para usarla:   Iniciar GamificApp.cmd
     Para cerrarla:                      Detener GamificApp.cmd
     Para cambiar opciones:              Configurar GamificApp.cmd


USARLA DESDE OTROS DISPOSITIVOS (TABLETS, TELÉFONOS, PORTÁTILES)
---------------------------------------------------------------
Si activaste esa opción, este equipo hace de servidor y los demás entran por
su navegador. No hay que instalar nada en ellos.

  · La dirección aparece SIEMPRE al final de "Iniciar GamificApp.cmd", con
    este aspecto:   http://192.168.1.50:5173
    También la muestra "Configurar GamificApp.cmd" en cualquier momento.

  · Esa dirección puede cambiar de un día para otro: el router la reparte y
    no siempre da la misma. GamificApp se adapta sola, no hay que reinstalar
    ni reconstruir nada. Por eso conviene mirarla en pantalla en vez de
    apuntarla en un papel.

  · Este equipo debe estar encendido y sin suspenderse mientras se use.

  · Windows preguntará una vez si permites el acceso a la red. Si no lo
    permitiste, "Configurar GamificApp.cmd" te dirá exactamente qué hacer.

  · Solo funciona dentro de la red local (el wifi o el cable de la escuela).
    No expone GamificApp a internet, y la conexión va sin cifrar: no actives
    esto en una red pública.


CÓMO ENTRAR
-----------
Al instalar se genera un archivo CREDENCIALES.txt en esta misma carpeta. Ahí
está la contraseña de la cuenta de administrador:

     Dirección   http://localhost:5173
     Usuario     admin
     Contraseña  la que aparece en CREDENCIALES.txt

Esa contraseña es única de tu equipo: nadie más la tiene, ni siquiera quien te
entregó GamificApp. Si cargaste los datos de demostración, ese mismo archivo
lista además el usuario del docente y el PIN del estudiante de prueba.


DÓNDE QUEDAN TUS DATOS
----------------------
En   %LOCALAPPDATA%\GamificApp
(escribe eso en la barra del Explorador de Windows y pulsa Enter).

Están FUERA de esta carpeta a propósito. Eso significa que:
  · puedes mover o borrar la carpeta de GamificApp y tus datos siguen ahí;
  · puedes reinstalar sin perder nada;
  · para hacer una copia de seguridad, cierra GamificApp y copia esa carpeta.


SI ALGO NO FUNCIONA
-------------------
Mira la carpeta  logs\  que se crea al instalar: ahí queda escrito todo lo
que ocurrió. Ninguno de esos archivos contiene contraseñas.


CONTENIDO DE ESTA CARPETA
-------------------------
  Instalar GamificApp.cmd     empieza por aquí
  Iniciar GamificApp.cmd      uso diario
  Detener GamificApp.cmd      cerrar la aplicación
  Configurar GamificApp.cmd   red local y arranque automático
  instalador\                 los pasos de la instalación
  runtime\node\               Node.js $versionNode (no se instala en Windows)
  runtime\mysql\              MySQL $versionMySql (no se instala en Windows)
  server\                     el servidor de GamificApp
  src\  public\  dist\        la página web
  database\                   la estructura de la base de datos
  node_modules\               las librerías, ya descargadas

Generado el $(Get-Date -Format 'yyyy-MM-dd HH:mm').
"@
# UTF-8 CON BOM y finales CRLF: así el Bloc de notas de Windows respeta los
# acentos y no muestra el texto en una sola línea.
$leeme = $leeme -replace "`r?`n", "`r`n"
[System.IO.File]::WriteAllText((Join-Path $Salida 'LEEME.txt'), $leeme, (New-Object System.Text.UTF8Encoding($true)))
Escribir-Ok 'LEEME.txt escrito.'

# ------------------------------------------------------------
# 9. Auditoría del paquete generado
# ------------------------------------------------------------
Escribir-Paso 'Auditando el paquete: secretos y artefactos prohibidos'
$hallazgos = @()

$archivosPaquete = @(Get-ChildItem -Path $Salida -Recurse -File -Force)

# --- 9a. Nombres de archivo prohibidos ---
foreach ($archivo in $archivosPaquete) {
    $relativa = $archivo.FullName.Substring($Salida.Length + 1)
    # node_modules y runtime son árboles de terceros copiados tal cual (npm y
    # los ZIP oficiales). Ahí un archivo .log o .env es material del propio
    # paquete de un tercero, no un secreto nuestro; se comprueban aparte.
    $deTerceros = ($relativa -like 'node_modules\*') -or ($relativa -like 'server\node_modules\*') -or ($relativa -like 'runtime\*')
    if ($NombresProhibidos -contains $archivo.Name) {
        if (-not $deTerceros) { $hallazgos += "ARTEFACTO PROHIBIDO: $relativa" }
    }
    if (-not $deTerceros) {
        foreach ($patron in $PatronesProhibidos) {
            if ($archivo.Name -like $patron) { $hallazgos += "ARTEFACTO PROHIBIDO: $relativa" }
        }
    }
}
# En los árboles de terceros sí es inaceptable encontrar NUESTROS artefactos.
foreach ($archivo in $archivosPaquete) {
    if ($archivo.Name -in @('CREDENCIALES.txt', 'root.txt', 'instancia.json', 'mysqld.pid', 'env-anterior-docker.bak')) {
        $hallazgos += "ARTEFACTO PROHIBIDO: $($archivo.FullName.Substring($Salida.Length + 1))"
    }
}

# --- 9b. Carpetas que nunca deben viajar ---
foreach ($prohibida in @('.git', '.run', 'logs', 'server\backups', 'runtime\descargas', 'docs')) {
    if (Test-Path (Join-Path $Salida $prohibida)) { $hallazgos += "CARPETA PROHIBIDA: $prohibida" }
}

# --- 9c. Valores secretos REALES de este equipo ---
# No se buscan nombres de variable (JWT_SECRET= es legítimo en .env.example):
# se buscan los VALORES concretos que existen hoy en este equipo.
$secretosReales = @{}
if (Test-Path $script:ArchivoEnv) {
    $envActual = Leer-Env $script:ArchivoEnv
    foreach ($clave in @('DB_PASSWORD', 'JWT_SECRET', 'ADMIN_PASSWORD', 'GEMINI_API_KEY', 'OPENAI_API_KEY')) {
        $valor = $envActual[$clave]
        if ($valor -and $valor.Length -ge 8) { $secretosReales[$clave] = $valor }
    }
}
$claveRoot = Leer-ClaveRoot
if ($claveRoot -and $claveRoot.Length -ge 8) { $secretosReales['MYSQL_ROOT'] = $claveRoot }
foreach ($v in $secretosReales.Values) { Registrar-Secreto $v }

# Rastros de ESTE equipo y de las pruebas. A propósito NO se busca el nombre
# de usuario ni el del equipo a secas: "extun" o "Fabrizio" sueltos aparecen
# de forma legítima (es el autor del proyecto) y llenarían la auditoría de
# ruido. Lo que delata un paquete mal armado es la RUTA ABSOLUTA y el
# principal de seguridad EQUIPO\usuario, que es como se escribe en una ACL.
$rastrosDelEquipo = @{
    MARCA_PRUEBAS = 'MARCA PERSISTENCIA 2026'
    RUTA_PERFIL   = $env:USERPROFILE
    RUTA_DATOS    = $script:CarpetaAppDatos
    PRINCIPAL_ACL = "$env:COMPUTERNAME\$env:USERNAME"
}

# Se revisan todos los archivos del paquete salvo los árboles de terceros:
# node_modules viene de npm y runtime\ de los ZIP oficiales, byte a byte, y
# ahí no hemos escrito nada.
$revisables = @($archivosPaquete | Where-Object {
    $rel = $_.FullName.Substring($Salida.Length + 1)
    -not (($rel -like 'node_modules\*') -or ($rel -like 'server\node_modules\*') -or ($rel -like 'runtime\*'))
})
$revisados = 0
foreach ($archivo in $revisables) {
    $relativa = $archivo.FullName.Substring($Salida.Length + 1)
    $texto = $null
    try { $texto = [System.IO.File]::ReadAllText($archivo.FullName) } catch { continue }
    $revisados++

    # Los VALORES secretos no se admiten en ningún archivo, sin excepciones.
    foreach ($par in $secretosReales.GetEnumerator()) {
        if ($texto.IndexOf($par.Value, [StringComparison]::Ordinal) -ge 0) {
            $hallazgos += "SECRETO ($($par.Key)) en: $relativa"
        }
    }

    # Nota: este propio archivo contiene, por fuerza, las cadenas que busca
    # (es donde están declaradas), pero NO viaja en el paquete —está en las
    # exclusiones de $CarpetasDelPaquete—, así que aquí no aparece y no hace
    # falta ninguna excepción.
    foreach ($par in $rastrosDelEquipo.GetEnumerator()) {
        if (-not $par.Value) { continue }
        if ($texto.IndexOf($par.Value, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $hallazgos += "RASTRO ($($par.Key)) en: $relativa"
        }
    }
}
Escribir-Detalle "$revisados archivos revisados en busca de secretos y rastros de este equipo (los arboles de terceros se excluyen: no escribimos en ellos)."

if ($hallazgos.Count -gt 0) {
    Write-Host ''
    foreach ($h in ($hallazgos | Sort-Object -Unique)) { Write-Host "     $h" -ForegroundColor Red }
    Terminar-Con-Error 'El paquete contiene artefactos que NO pueden distribuirse.' @(
        'Se han listado arriba. El paquete queda tal cual para que puedas revisarlo,',
        'pero NO debe entregarse en este estado.'
    )
}
Escribir-Ok 'Auditoria limpia: sin secretos, sin datos y sin artefactos de este equipo.'

# ------------------------------------------------------------
# 10. Inventario y metadatos
# ------------------------------------------------------------
Escribir-Paso 'Generando el inventario del paquete'
$total = Medir-Carpeta $Salida

$componentes = @()
foreach ($ruta in @('runtime\mysql', 'runtime\node', 'node_modules', 'server\node_modules',
                    'dist', 'src', 'server', 'instalador', 'database', 'public')) {
    # server tiene su propia fila y ademas contiene server\node_modules, que
    # tambien la tiene: se descuenta para que los porcentajes sumen bien.
    $excluir = $(if ($ruta -eq 'server') { 'node_modules' } else { '' })
    $m = Medir-Carpeta -Ruta (Join-Path $Salida $ruta) -Excluir $excluir
    if ($m.Archivos -gt 0) {
        $componentes += [pscustomobject]@{
            Componente = $ruta
            Bytes      = $m.Bytes
            Archivos   = $m.Archivos
            Porcentaje = [math]::Round(($m.Bytes / $total.Bytes) * 100, 1)
        }
    }
}
$componentes = $componentes | Sort-Object Bytes -Descending

$lineasInventario = @()
$lineasInventario += 'GamificApp — Inventario del paquete de distribucion'
$lineasInventario += "Generado el $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$lineasInventario += ''
$lineasInventario += ('{0,-22} {1,12} {2,10} {3,7}' -f 'COMPONENTE', 'TAMANO', 'ARCHIVOS', '%')
$lineasInventario += ('-' * 55)
foreach ($c in $componentes) {
    $lineasInventario += ('{0,-22} {1,12} {2,10} {3,6}%' -f $c.Componente, (Formatear-Tamano $c.Bytes), $c.Archivos, $c.Porcentaje)
}
$lineasInventario += ('-' * 55)
$lineasInventario += ('{0,-22} {1,12} {2,10}' -f 'TOTAL', (Formatear-Tamano $total.Bytes), $total.Archivos)
$lineasInventario += ''
$lineasInventario += 'MySQL portable: se distribuye podado.'
$lineasInventario += ("  original {0}  ->  paquete {1}  ({2} archivos fuera, {3})" -f `
    (Formatear-Tamano $bytesOriginal), (Formatear-Tamano $mMySql.Bytes), $podados.Count, (Formatear-Tamano $bytesPodados))
$lineasInventario += '  Se quitan solo: *.pdb (simbolos de depuracion), *.lib (compilacion),'
$lineasInventario += '  *-debug.dll y lib\plugin\debug (piden un CRT de depuracion que no'
$lineasInventario += '  existe fuera de Visual Studio) e include\ (cabeceras C).'
$lineasInventario += ''
$lineasInventario += 'Fuera del paquete, en el equipo de destino:'
$lineasInventario += '  server\.env, CREDENCIALES.txt, logs\, .run\  -> se generan al instalar'
$lineasInventario += '  %LOCALAPPDATA%\GamificApp\                   -> los datos, permanentes'
$textoInventario = ($lineasInventario -join "`r`n") + "`r`n"
[System.IO.File]::WriteAllText((Join-Path $Salida 'INVENTARIO.txt'), $textoInventario, (New-Object System.Text.UTF8Encoding($true)))

# PAQUETE.json: metadatos y, sobre todo, la marca que autoriza a este script
# a borrar esta carpeta la próxima vez. Sin contraseñas ni rutas del equipo.
$metadatos = [pscustomobject]@{
    producto        = 'GamificApp'
    formato         = 1
    generado        = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    nodeVersion     = $versionNode
    mysqlVersion    = $versionMySql
    vcRuntime       = $script:VcRuntimeDlls
    dependencias    = (-not $SinDependencias)
    archivos        = $total.Archivos
    bytes           = [long]$total.Bytes
    mysqlPodadoDe   = [long]$bytesOriginal
    mysqlPodadoA    = [long]$mMySql.Bytes
}
$metadatos | ConvertTo-Json | Out-File -FilePath $marcaPaquete -Encoding utf8
Escribir-Ok 'INVENTARIO.txt y PAQUETE.json escritos.'

# ------------------------------------------------------------
# 11. ZIP (opcional)
# ------------------------------------------------------------
$rutaZip = ''
if ($Zip) {
    Escribir-Paso 'Comprimiendo el paquete'
    Escribir-Detalle 'Son mas de 60.000 archivos: tarda varios minutos.'
    $rutaZip = "$Salida.zip"
    if (Test-Path $rutaZip) { Remove-Item -Path $rutaZip -Force }
    $relojZip = [System.Diagnostics.Stopwatch]::StartNew()

    # Se prefiere el tar.exe de Windows (bsdtar/libarchive, incluido desde
    # Windows 10 1803) porque con decenas de miles de entradas pequenas es
    # ordenes de magnitud mas rapido que System.IO.Compression: medido sobre
    # este mismo paquete, 6,5 minutos frente a horas.
    $tar = Join-Path $env:WINDIR 'System32\tar.exe'
    $padre = Split-Path -Parent $Salida
    $hoja  = Split-Path -Leaf $Salida
    $hecho = $false
    if (Test-Path $tar) {
        & $tar -a -c -f $rutaZip -C $padre $hoja
        $hecho = ($LASTEXITCODE -eq 0 -and (Test-Path $rutaZip))
        if (-not $hecho) { Escribir-Aviso 'tar.exe no pudo comprimir; se intenta con el metodo lento.' }
    }
    if (-not $hecho) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        if (Test-Path $rutaZip) { Remove-Item -Path $rutaZip -Force }
        [System.IO.Compression.ZipFile]::CreateFromDirectory(
            $Salida, $rutaZip, [System.IO.Compression.CompressionLevel]::Fastest, $true)
    }
    $relojZip.Stop()
    $bytesZip = (Get-Item $rutaZip).Length
    Escribir-Ok ("ZIP generado: {0} en {1:N0} s (desde {2})" -f `
        (Formatear-Tamano $bytesZip), $relojZip.Elapsed.TotalSeconds, (Formatear-Tamano $total.Bytes))
    Escribir-Detalle $rutaZip
}

# ------------------------------------------------------------
# 12. Resumen
# ------------------------------------------------------------
$cronometro.Stop()
Write-Host ''
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   PAQUETE LISTO" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Carpeta : $Salida" -ForegroundColor White
Write-Host ("   Tamano  : {0} en {1} archivos" -f (Formatear-Tamano $total.Bytes), $total.Archivos) -ForegroundColor White
if ($rutaZip) { Write-Host "   ZIP     : $rutaZip" -ForegroundColor White }
Write-Host ("   Tiempo  : {0:N1} s" -f $cronometro.Elapsed.TotalSeconds) -ForegroundColor White
Write-Host ''
foreach ($c in $componentes) {
    Write-Host ("     {0,-22} {1,12}  {2,5}%" -f $c.Componente, (Formatear-Tamano $c.Bytes), $c.Porcentaje) -ForegroundColor DarkGray
}
Write-Host ''
Write-Host "   Pruebalo DESDE ESA COPIA, no desde el repositorio." -ForegroundColor Yellow
Write-Host ''
Escribir-Log "Empaquetado completado en $Salida" 'OK' $false
exit 0
