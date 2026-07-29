# ============================================================
# GamificApp — Instalación local guiada para Windows.
# Punto de entrada real: "Instalar GamificApp.cmd" (doble clic).
#
# Node.js ya NO es un requisito previo (Fase Local 2.1): si el equipo no lo
# tiene, o el que tiene no sirve, se descarga una copia portable verificada
# dentro de runtime\node\ sin instalar nada en el sistema.
#
# MySQL tampoco lo es (Fase Local 2.2) cuando la distribución trae
# runtime\mysql: se arranca una instancia propia en el puerto 3308 (con
# reserva 3309-3315), con los datos en %LOCALAPPDATA%\GamificApp\, sin
# servicio de Windows y sin permisos de administrador. Si NO viene ese
# runtime, se conserva intacto el camino de la Fase Local 1: detectar un
# MySQL 8 ya instalado y pedir sus credenciales.
#
# Es SEGURO ejecutarlo varias veces: no regenera credenciales existentes,
# no borra la base de datos y no vuelve a sembrar nada sin permiso.
#
# Parámetros avanzados (no se usan en el doble clic):
#   -BaseDatos <nombre>     apunta a otra base local; solo tiene efecto cuando
#                           todavía no existe server/.env. Sirve para probar la
#                           instalación desde cero sin tocar una base con datos.
#   -PrepararRuntimeNode    fuerza la descarga del Node portable aunque el
#                           equipo ya tenga uno compatible. Sirve para armar
#                           la distribución y para probar el camino portable.
# ============================================================
param(
    [string]$BaseDatos = '',
    [switch]$PrepararRuntimeNode
)

. (Join-Path $PSScriptRoot 'comun.ps1')
. (Join-Path $PSScriptRoot 'runtime.ps1')
. (Join-Path $PSScriptRoot 'mysql.ps1')

Iniciar-Registro 'instalador'
Escribir-Titulo 'GamificApp — Instalacion local'
Write-Host "   Carpeta del proyecto: $script:Raiz" -ForegroundColor DarkGray

# ------------------------------------------------------------
# Utilidades locales de este script
# ------------------------------------------------------------
function Preguntar-Texto {
    param([string]$Pregunta, [string]$Predeterminado = '')
    $sufijo = ''
    if ($Predeterminado -ne '') { $sufijo = " [$Predeterminado]" }
    $respuesta = Read-Host "   $Pregunta$sufijo"
    if ([string]::IsNullOrWhiteSpace($respuesta)) { return $Predeterminado }
    return $respuesta.Trim()
}

function Preguntar-SiNo {
    param([string]$Pregunta)
    # El predeterminado es SIEMPRE "No": nada opcional ocurre por inercia.
    while ($true) {
        $respuesta = Read-Host "   $Pregunta [s/N]"
        if ([string]::IsNullOrWhiteSpace($respuesta)) { return $false }
        $r = $respuesta.Trim().ToLower()
        if ($r -eq 's' -or $r -eq 'si' -or $r -eq 'sí' -or $r -eq 'y') { return $true }
        if ($r -eq 'n' -or $r -eq 'no') { return $false }
        Write-Host '   Responde s o n.' -ForegroundColor Yellow
    }
}

function Preguntar-Clave {
    param([string]$Pregunta)
    # Con una consola real la contraseña no se muestra al teclearla. Si la
    # entrada viene redirigida (ejecución automatizada), -AsSecureString se
    # quedaría esperando para siempre: en ese caso se lee como texto normal.
    $redirigida = $false
    try { $redirigida = [Console]::IsInputRedirected } catch { $redirigida = $false }
    if ($redirigida) { return (Read-Host "   $Pregunta").Trim() }

    $segura = Read-Host "   $Pregunta" -AsSecureString
    if (-not $segura -or $segura.Length -eq 0) { return '' }
    $puntero = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($puntero) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero) }
}

function Instalar-Dependencias {
    param([string]$Carpeta, [string]$Etiqueta)
    $lock    = Join-Path $Carpeta 'package-lock.json'
    $modulos = Join-Path $Carpeta 'node_modules'
    $marcador = Join-Path $script:CarpetaRun "dependencias-$Etiqueta.txt"
    # Marcador que escribe el EMPAQUETADOR cuando node_modules ya viaja dentro
    # de la distribucion. Se guarda en instalador\ (no en .run\, que es estado
    # de ejecucion de cada equipo) y contiene el SHA-256 del package-lock.json
    # con el que se instalaron esas dependencias.
    $marcadorPaquete = Join-Path $PSScriptRoot "dependencias-$Etiqueta.sha256"

    if (-not (Test-Path $lock)) {
        Terminar-Con-Error "Falta package-lock.json en $Carpeta." @(
            'La copia del proyecto esta incompleta. Vuelve a descargarla.'
        )
    }
    $huella = (Get-FileHash -Path $lock -Algorithm SHA256).Hash
    if ((Test-Path $modulos) -and (Test-Path $marcador)) {
        $previa = (Get-Content -Path $marcador -Raw -ErrorAction SilentlyContinue)
        if ($previa -and $previa.Trim() -eq $huella) {
            Escribir-Ok "Dependencias de $Etiqueta ya instaladas y al dia."
            return
        }
    }
    # Dependencias incluidas en el paquete: se evita 'npm ci' —y con el la
    # necesidad de internet— solo si el package-lock.json es exactamente el
    # mismo con el que se prepararon.
    if ((Test-Path $modulos) -and (Test-Path $marcadorPaquete)) {
        $delPaquete = (Get-Content -Path $marcadorPaquete -Raw -ErrorAction SilentlyContinue)
        if ($delPaquete -and $delPaquete.Trim() -eq $huella) {
            if (-not (Test-Path $script:CarpetaRun)) { New-Item -ItemType Directory -Path $script:CarpetaRun -Force | Out-Null }
            $huella | Out-File -FilePath $marcador -Encoding utf8
            Escribir-Ok "Dependencias de $Etiqueta incluidas en el paquete: no hace falta descargar nada."
            return
        }
        Escribir-Aviso "Las dependencias de $Etiqueta que trae el paquete no corresponden a este package-lock.json: se reinstalan."
    }

    Escribir-Detalle "Instalando dependencias de $Etiqueta con 'npm ci'. Puede tardar varios minutos..."
    $salida  = Join-Path $script:CarpetaLogs "npm-$Etiqueta.log"
    $errores = Join-Path $script:CarpetaLogs "npm-$Etiqueta-errores.log"
    # Se invoca npm-cli.js con el Node elegido (portable o global): asi no
    # dependemos de que exista un `npm` en el PATH del sistema.
    $codigo = Invocar-Npm -Argumentos @('ci') -Carpeta $Carpeta `
        -LogSalida $salida -LogErrores $errores
    if ($codigo -ne 0) {
        Mostrar-ColaLog -Ruta $errores -Lineas 20
        Terminar-Con-Error "Fallo la instalacion de dependencias de $Etiqueta (npm ci)." @(
            'Causas habituales: no hay conexion a internet, o un antivirus bloquea la escritura.',
            "Detalle completo en: $errores"
        )
    }
    if (-not (Test-Path $script:CarpetaRun)) { New-Item -ItemType Directory -Path $script:CarpetaRun -Force | Out-Null }
    $huella | Out-File -FilePath $marcador -Encoding utf8
    Escribir-Ok "Dependencias de $Etiqueta instaladas."
}

# ------------------------------------------------------------
# 1. Node.js y npm  (portable si hace falta)
# ------------------------------------------------------------
Preparar-RuntimeNode -Forzar:$PrepararRuntimeNode
Comprobar-Requisitos-Node

# ------------------------------------------------------------
# 2. Datos de conexion a MySQL
# ------------------------------------------------------------
Escribir-Paso 'Preparando la conexion con MySQL'

$envExistia = Test-Path $script:ArchivoEnv
$conexion = $null
$crearUsuarioApp = $false
# ¿La base de datos la pone GamificApp (portable) o es una del equipo?
$usaPortable = $false
# Solo se ofrecen datos de demostración sobre una base RECIÉN creada: si ya
# había datos, nunca se propone escribir encima de ellos.
$datosRecienCreados = $false

if ($envExistia) {
    # Ya hay una instalacion previa: se respeta tal cual. NO se pregunta
    # nada y NO se regenera ninguna credencial.
    $env0 = Leer-Env $script:ArchivoEnv
    $conexion = [pscustomobject]@{
        Servidor = $(if ($env0['DB_HOST']) { $env0['DB_HOST'] } else { 'localhost' })
        Puerto   = $(if ($env0['DB_PORT']) { [int]$env0['DB_PORT'] } else { 3306 })
        Usuario  = $(if ($env0['DB_USER']) { $env0['DB_USER'] } else { 'root' })
        Clave    = $(if ($env0['DB_PASSWORD']) { $env0['DB_PASSWORD'] } else { '' })
        Base     = $(if ($env0['DB_NAME']) { $env0['DB_NAME'] } else { $script:BaseDatosPredeterminada })
    }
    Registrar-Secreto $conexion.Clave
    Escribir-Ok 'Ya existe server/.env: se conserva la configuracion anterior.'
    Escribir-Detalle "Servidor: $($conexion.Servidor):$($conexion.Puerto)  ·  Base: $($conexion.Base)  ·  Usuario: $($conexion.Usuario)"
    if ($BaseDatos -ne '' -and $BaseDatos -ne $conexion.Base) {
        Escribir-Aviso "Se ignora -BaseDatos '$BaseDatos': manda el DB_NAME de server/.env."
    }

    # Si ese server/.env describe NUESTRA instancia portable, hay que
    # encenderla antes de sondear el puerto: si no, la sonda de mas abajo
    # diria que "MySQL esta apagado" cuando en realidad solo hacia falta
    # arrancarlo.
    if ((Test-MySqlPortableDisponible) -and (Test-EnvEsInstanciaPortable -Servidor $conexion.Servidor -Puerto $conexion.Puerto)) {
        $usaPortable = $true
        [void](Asegurar-MySqlPortableEnMarcha -Puerto $conexion.Puerto)
    }
} elseif (Test-MySqlPortableDisponible) {
    # GamificApp trae su propia base de datos: no se pregunta nada y no se
    # necesita ningun MySQL instalado en el equipo.
    #
    # Este mismo camino cubre la RECONSTRUCCION: si el usuario reemplazo la
    # carpeta del proyecto y perdio server/.env pero conserva sus datos en
    # %LOCALAPPDATA%, Preparar-MySqlPortable los reutiliza tal cual (no
    # inicializa nada) y mas abajo se regeneran las credenciales de la
    # aplicacion a partir de la credencial de administracion guardada.
    $base = $script:BaseDatosPredeterminada
    if ($BaseDatos -ne '') { $base = $BaseDatos }

    $usaPortable = $true
    $portable = Preparar-MySqlPortable -Base $base
    $datosRecienCreados = $portable.EsNueva
    $conexion = [pscustomobject]@{
        Servidor = $portable.Servidor
        Puerto   = $portable.Puerto
        Usuario  = $portable.Usuario
        Clave    = $portable.Clave
        Base     = $portable.Base
    }
    $crearUsuarioApp = $true
} else {
    # Sin runtime portable: camino de la Fase Local 1, intacto. Detectamos
    # donde puede estar un MySQL ya instalado y preguntamos.
    $base = $script:BaseDatosPredeterminada
    if ($BaseDatos -ne '') { $base = $BaseDatos }

    $puertoSugerido = 0
    foreach ($candidato in @(3306, 3307)) {
        if (Test-PuertoTcpAbierto -Servidor '127.0.0.1' -Puerto $candidato) { $puertoSugerido = $candidato; break }
    }
    if ($puertoSugerido -eq 0) {
        Terminar-Con-Error 'No se encontro ningun servidor MySQL escuchando en este equipo.' @(
            'Esta copia de GamificApp no incluye su propia base de datos (falta la',
            'carpeta runtime\mysql), asi que necesita MySQL 8 ya instalado.',
            '',
            'Lo mas comodo es volver a descargar GamificApp completa: la version',
            'completa trae la base de datos incluida y no hace falta instalar nada.',
            '',
            'Si prefieres usar un MySQL propio:',
            'Que hacer:',
            '  1. Instala MySQL 8 Community Server desde  https://dev.mysql.com/downloads/mysql/',
            '     (durante la instalacion se te pedira una contrasena para el usuario root: anotala).',
            '  2. Comprueba que el servicio esta iniciado:',
            '     abre "Servicios" de Windows y busca MySQL80 -> Estado: En ejecucion.',
            '  3. Vuelve a ejecutar este archivo.'
        )
    }
    Escribir-Ok "Se detecto un servidor escuchando en 127.0.0.1:$puertoSugerido."
    Write-Host ''
    Write-Host '   Hacen falta credenciales de MySQL con permiso para crear la base de datos' -ForegroundColor White
    Write-Host '   (normalmente el usuario "root" y la contrasena que pusiste al instalar MySQL).' -ForegroundColor White
    Write-Host ''

    $servidor = Preguntar-Texto -Pregunta 'Servidor MySQL' -Predeterminado 'localhost'
    $puerto   = Preguntar-Texto -Pregunta 'Puerto' -Predeterminado "$puertoSugerido"
    $usuario  = Preguntar-Texto -Pregunta 'Usuario administrador de MySQL' -Predeterminado 'root'
    $clave    = Preguntar-Clave  -Pregunta 'Contrasena de ese usuario (no se muestra al escribir)'
    Registrar-Secreto $clave

    $conexion = [pscustomobject]@{
        Servidor = $servidor
        Puerto   = [int]$puerto
        Usuario  = $usuario
        Clave    = $clave
        Base     = $base
    }
    $crearUsuarioApp = $true
}

# Sonda rapida: si ni siquiera hay algo escuchando, cortamos antes de
# invertir minutos en instalar dependencias.
if (-not (Test-PuertoTcpAbierto -Servidor $conexion.Servidor -Puerto $conexion.Puerto)) {
    Terminar-Con-Error "No hay nada escuchando en $($conexion.Servidor):$($conexion.Puerto)." @(
        'El servidor MySQL parece apagado.',
        '',
        'Que hacer:',
        '  1. Abre "Servicios" de Windows (tecla Windows, escribe Servicios).',
        '  2. Busca MySQL80 (o el nombre de tu instalacion) y pulsa Iniciar.',
        '  3. Vuelve a ejecutar este archivo.'
    )
}
Escribir-Ok "El servidor MySQL responde en $($conexion.Servidor):$($conexion.Puerto)."

# ------------------------------------------------------------
# 3. Puertos de la aplicacion
# ------------------------------------------------------------
Escribir-Paso 'Comprobando los puertos 3001 (servidor) y 5173 (pagina web)'

foreach ($puerto in @($script:PuertoBackend, $script:PuertoFrontend)) {
    $dueno = Obtener-DuenoPuerto -Puerto $puerto
    if (-not $dueno) { Escribir-Ok "Puerto $puerto libre."; continue }

    # Si es una instancia nuestra, la paramos para poder reinstalar limpio.
    $nombreServicio = $(if ($puerto -eq $script:PuertoBackend) { 'backend' } else { 'frontend' })
    $registro = Leer-Proceso $nombreServicio
    if ($registro -and [int]$registro.pid -eq $dueno.ProcesoId) {
        Escribir-Aviso "El puerto $puerto lo ocupa GamificApp (PID $($dueno.ProcesoId)). Se detiene para reinstalar."
        [void](Detener-Servicio $nombreServicio)
        Start-Sleep -Milliseconds 500
        continue
    }
    Terminar-Con-Error "El puerto $puerto ya esta ocupado por otro programa." @(
        "Lo usa: $($dueno.Nombre) (PID $($dueno.ProcesoId))",
        '',
        'GamificApp necesita ese puerto exacto: la pagina web y el servidor',
        'estan configurados para hablarse por 5173 y 3001, y cambiarlos rompe',
        'la conexion entre ambos.',
        '',
        'Que hacer:',
        '  1. Cierra el programa que lo esta usando.',
        '  2. Si era una version anterior de GamificApp, ejecuta "Detener GamificApp.cmd".',
        '  3. Vuelve a ejecutar este archivo.'
    )
}

# ------------------------------------------------------------
# 4. Dependencias (npm ci)
# ------------------------------------------------------------
Escribir-Paso 'Instalando las dependencias del proyecto'
Instalar-Dependencias -Carpeta $script:CarpetaServer -Etiqueta 'servidor'
Instalar-Dependencias -Carpeta $script:Raiz -Etiqueta 'frontend'

# ------------------------------------------------------------
# 5. Comprobacion REAL de MySQL (handshake, no solo puerto abierto)
# ------------------------------------------------------------
Escribir-Paso 'Verificando el servidor MySQL'

$verificacion = Invocar-ScriptBD -Script 'bd-verificar.mjs' -Variables @{
    GA_DB_HOST     = $conexion.Servidor
    GA_DB_PORT     = "$($conexion.Puerto)"
    GA_DB_USER     = $conexion.Usuario
    GA_DB_PASSWORD = $conexion.Clave
}
if (-not $verificacion.ok) {
    $pistas = @()
    if ("$($verificacion.codigo)" -eq 'ER_ACCESS_DENIED_ERROR') {
        $pistas = @(
            'El usuario o la contrasena de MySQL no son correctos.',
            '',
            'Que hacer:',
            '  · Vuelve a ejecutar este archivo y escribe bien la contrasena.',
            '  · Si no la recuerdas, puedes reiniciarla desde MySQL Installer.'
        )
    } else {
        $pistas = @(
            "Respuesta de MySQL: $($verificacion.error)",
            '',
            'Comprueba que el servicio de MySQL esta iniciado y vuelve a intentarlo.'
        )
    }
    if ($envExistia) {
        $pistas += ''
        $pistas += 'Las credenciales salen de server/.env (no se han modificado).'
    }
    Terminar-Con-Error 'No se pudo conectar con MySQL.' $pistas
}
if ([int]$verificacion.mayor -lt 8) {
    Terminar-Con-Error "La version de MySQL ($($verificacion.version)) es demasiado antigua." @(
        'GamificApp necesita MySQL 8 o superior.',
        'Descarga MySQL 8 Community Server desde https://dev.mysql.com/downloads/mysql/'
    )
}
Escribir-Ok "MySQL $($verificacion.version) responde correctamente."

# ------------------------------------------------------------
# 6. Base de datos + esquema base
# ------------------------------------------------------------
Escribir-Paso "Preparando la base de datos '$($conexion.Base)'"

$claveApp = ''
$variables = @{
    GA_DB_HOST     = $conexion.Servidor
    GA_DB_PORT     = "$($conexion.Puerto)"
    GA_DB_USER     = $conexion.Usuario
    GA_DB_PASSWORD = $conexion.Clave
    GA_BASE        = $conexion.Base
}
if ($crearUsuarioApp) {
    $claveApp = Nueva-ClaveLegible -Longitud 20
    Registrar-Secreto $claveApp
    $variables['GA_APP_USER']     = $script:UsuarioAppMySQL
    $variables['GA_APP_PASSWORD'] = $claveApp
}

$preparacion = Invocar-ScriptBD -Script 'bd-preparar.mjs' -Variables $variables
if (-not $preparacion.ok) {
    Terminar-Con-Error 'No se pudo preparar la base de datos.' @(
        "Detalle: $($preparacion.error)",
        '',
        'Si el usuario de MySQL que indicaste no tiene permiso para crear bases',
        'de datos, usa uno que si lo tenga (normalmente root).'
    )
}
if ($preparacion.baseCreada) {
    Escribir-Ok "Base de datos '$($conexion.Base)' creada."
} else {
    Escribir-Ok "Base de datos '$($conexion.Base)' ya existia: se conserva con sus datos."
}
Escribir-Detalle "Esquema base cargado (database/produccion_defaultdb.sql). Tablas: $($preparacion.tablasAntes) -> $($preparacion.tablasDespues)."

# Credenciales que acabaran en server/.env.
$usuarioFinal = $conexion.Usuario
$claveFinal   = $conexion.Clave
if ($crearUsuarioApp) {
    if ($preparacion.usuarioAppCreado) {
        $usuarioFinal = $script:UsuarioAppMySQL
        $claveFinal   = $claveApp
        Escribir-Ok "Usuario de aplicacion '$script:UsuarioAppMySQL' creado con permisos solo sobre esa base."
    } else {
        Escribir-Aviso 'No se pudo crear un usuario dedicado de MySQL; se usaran las credenciales que indicaste.'
        if ($preparacion.motivoUsuario) { Escribir-Detalle "Motivo: $($preparacion.motivoUsuario)" }
    }
}

# ------------------------------------------------------------
# 7. server/.env — crear si falta, CONSERVAR si ya existe
# ------------------------------------------------------------
Escribir-Paso 'Configurando server/.env'

$claveAdmin = ''
if (-not $envExistia) {
    $secretoJwt = Nuevo-SecretoHex -Bytes 48
    Registrar-Secreto $secretoJwt
    $claveAdmin = Nueva-ClaveLegible -Longitud 14
    Registrar-Secreto $claveAdmin

    $contenido = @"
# ============================================================
# Configuracion LOCAL de GamificApp — generada por el instalador
# el $(Get-Date -Format 'yyyy-MM-dd HH:mm').
#
# Este archivo esta en .gitignore: nunca se sube al repositorio.
# El instalador NO lo vuelve a generar si ya existe, asi que tus
# credenciales se mantienen entre ejecuciones.
# ============================================================

PORT=$($script:PuertoBackend)

# Origen permitido del frontend. Debe coincidir con el puerto estricto de Vite.
CORS_ORIGIN=$($script:UrlFrontend)

# --- MySQL local ---
DB_HOST=$($conexion.Servidor)
DB_PORT=$($conexion.Puerto)
DB_USER=$usuarioFinal
DB_PASSWORD=$claveFinal
DB_NAME=$($conexion.Base)

# Firma de los tokens de sesion. Generada al azar; no la compartas.
JWT_SECRET=$secretoJwt
JWT_EXPIRES_IN=8h

# Contrasena de la cuenta 'admin'. El servidor la aplica al arrancar.
ADMIN_PASSWORD=$claveAdmin

# --- Inteligencia artificial (opcional) ---
# Sin clave, la app funciona igual: solo se desactiva generar contenido con IA.
GEMINI_API_KEY=
OPENAI_API_KEY=
IA_PROVEEDOR=gemini
IA_MODELO=

# Boton "Restablecer aplicacion": borra casi toda la base. Se deja apagado.
RESET_HABILITADO=false
"@
    Escribir-TextoSinBom -Ruta $script:ArchivoEnv -Contenido $contenido
    Escribir-Ok 'server/.env creado con credenciales nuevas y aleatorias.'
} else {
    # Segunda ejecucion: se conserva intacto. Solo se completan las variables
    # obligatorias que falten (sin tocar ninguna linea existente).
    $envActual = Leer-Env $script:ArchivoEnv
    $claveAdmin = $envActual['ADMIN_PASSWORD']

    if (-not $envActual['JWT_SECRET']) {
        $nuevo = Nuevo-SecretoHex -Bytes 48
        Registrar-Secreto $nuevo
        Agregar-ClaveEnv -Ruta $script:ArchivoEnv -Clave 'JWT_SECRET' -Valor $nuevo -Comentario 'Firma de los tokens de sesion — faltaba'
        Escribir-Aviso 'Faltaba JWT_SECRET en server/.env: se genero uno nuevo.'
    }
    if (-not $claveAdmin) {
        $claveAdmin = Nueva-ClaveLegible -Longitud 14
        Registrar-Secreto $claveAdmin
        Agregar-ClaveEnv -Ruta $script:ArchivoEnv -Clave 'ADMIN_PASSWORD' -Valor $claveAdmin -Comentario 'Contrasena de la cuenta admin — faltaba'
        Escribir-Aviso 'Faltaba ADMIN_PASSWORD en server/.env: se genero una nueva.'
    } else {
        Registrar-Secreto $claveAdmin
    }
    Escribir-Ok 'server/.env conservado: JWT_SECRET y ADMIN_PASSWORD no se han tocado.'
}

# ------------------------------------------------------------
# 8. Pregunta (una sola vez, antes de las esperas largas):
#    datos de demostracion. Predeterminado: NO.
# ------------------------------------------------------------
$sembrarDemo = $false
$esBaseDemo = ($conexion.Base -eq $script:BaseDatosPredeterminada)
$esServidorLocal = ($conexion.Servidor -eq 'localhost' -or $conexion.Servidor -eq '127.0.0.1' -or $conexion.Servidor -eq '::1')

Escribir-Paso 'Datos de demostracion (opcional)'
# Con base portable solo se ofrecen si la base se acaba de crear: sobre datos
# que ya existian no se propone escribir nada.
$puedeOfrecerDemo = $esBaseDemo -and $esServidorLocal -and ((-not $usaPortable) -or $datosRecienCreados)
if ($puedeOfrecerDemo) {
    Write-Host '   Puedo crear cuentas y actividades FICTICIAS para que puedas probar la' -ForegroundColor White
    Write-Host '   aplicacion enseguida: un docente, cuatro estudiantes y una actividad de' -ForegroundColor White
    Write-Host '   cada uno de los 7 juegos. No son datos reales de ninguna escuela.' -ForegroundColor White
    Write-Host '   Si respondes que no, la aplicacion queda vacia y lista para usarse con la' -ForegroundColor White
    Write-Host '   cuenta de administrador.' -ForegroundColor White
    Write-Host ''
    $sembrarDemo = Preguntar-SiNo -Pregunta 'Deseas cargar datos de demostracion?'
    if ($sembrarDemo) { Escribir-Log '   Respuesta: SI, se sembraran datos de demostracion.' 'INFO' $true 'Yellow' }
    else { Escribir-Ok 'No se cargaran datos de demostracion.' }
} elseif ($usaPortable -and -not $datosRecienCreados) {
    Escribir-Detalle 'Omitido: ya tienes datos guardados y no se escribe encima de ellos.'
} else {
    Escribir-Detalle "Omitido: los datos de demostracion solo se permiten sobre la base local '$($script:BaseDatosPredeterminada)'."
}

# ------------------------------------------------------------
# 9. Construir la pagina web
# ------------------------------------------------------------
Escribir-Paso 'Construyendo la pagina web (npm run build)'
$salidaBuild  = Join-Path $script:CarpetaLogs 'build.log'
$erroresBuild = Join-Path $script:CarpetaLogs 'build-errores.log'
# Invocar-Npm antepone la carpeta del Node elegido al PATH del proceso: el
# lanzador node_modules\.bin\vite.cmd busca `node` ahi cuando no encuentra
# un node.exe junto a el, y sin eso el build fallaria sin Node global.
$codigoBuild = Invocar-Npm -Argumentos @('run', 'build') -Carpeta $script:Raiz `
    -LogSalida $salidaBuild -LogErrores $erroresBuild
if ($codigoBuild -ne 0) {
    Mostrar-ColaLog -Ruta $erroresBuild -Lineas 20
    Terminar-Con-Error 'Fallo la construccion de la pagina web.' @(
        "Detalle completo en: $erroresBuild"
    )
}
if (-not (Test-Path (Join-Path $script:Raiz 'dist\index.html'))) {
    Terminar-Con-Error 'La construccion termino sin errores pero no genero la carpeta dist.' @(
        "Revisa: $salidaBuild"
    )
}
Escribir-Ok 'Pagina web construida (carpeta dist).'

# ------------------------------------------------------------
# 10. Arrancar el servidor y esperar a que responda de verdad
# ------------------------------------------------------------
Escribir-Paso 'Iniciando el servidor de GamificApp'
$procesoBackend = Iniciar-Backend
Escribir-Detalle "Proceso del servidor: PID $($procesoBackend.Id)"

$salud = Esperar-Respuesta -Url "$($script:UrlBackend)/api/health" -SegundosMax 60 -Proceso $procesoBackend
if (-not $salud.Ok) {
    Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'backend.log') -Lineas 15
    Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'backend-errores.log') -Lineas 15
    [void](Detener-Servicio 'backend')
    Terminar-Con-Error 'El servidor no llego a responder.' @(
        $salud.Motivo,
        '',
        "Revisa el detalle en: $(Join-Path $script:CarpetaLogs 'backend-errores.log')"
    )
}
Escribir-Ok 'El servidor responde (/api/health).'

# Segunda comprobacion: esta ruta SI consulta la base de datos, asi que
# demuestra que el esquema quedo bien inicializado, no solo que el proceso vive.
$saludBd = Esperar-Respuesta -Url "$($script:UrlBackend)/api/institucion" -SegundosMax 40 -Proceso $procesoBackend
if (-not $saludBd.Ok) {
    Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'backend-errores.log') -Lineas 15
    [void](Detener-Servicio 'backend')
    Terminar-Con-Error 'El servidor arranco pero no puede leer la base de datos.' @(
        $saludBd.Motivo,
        '',
        'Revisa que MySQL siga en marcha y que los datos de server/.env sean correctos.'
    )
}
Escribir-Ok 'La base de datos responde.'

# IMPORTANTE: server.js empieza a escuchar ANTES de terminar
# `inicializarEsquema()`, asi que responder /api/health NO significa que las
# migraciones hayan acabado. El esquema base aporta 11 tablas y las
# migraciones de initDb.js las 7 restantes: esperamos a verlas de verdad.
$esquema = Invocar-ScriptBD -Script 'bd-verificar.mjs' -Variables @{
    GA_DB_HOST          = $conexion.Servidor
    GA_DB_PORT          = "$($conexion.Puerto)"
    GA_DB_USER          = $usuarioFinal
    GA_DB_PASSWORD      = $claveFinal
    GA_DB_NAME          = $conexion.Base
    GA_ESPERAR_TABLAS   = $script:TablasDeMigraciones
    GA_ESPERAR_ADMIN    = '1'
    GA_ESPERAR_SEGUNDOS = '90'
}
if (-not $esquema.ok) {
    $pendientes = ''
    if ($esquema.faltan) { $pendientes = ($esquema.faltan -join ', ') }
    Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'backend-errores.log') -Lineas 15
    [void](Detener-Servicio 'backend')
    Terminar-Con-Error 'La base de datos no llego a quedar lista.' @(
        $(if ($pendientes) { "Faltan tablas por crear: $pendientes" } else { "Detalle: $($esquema.error)" }),
        '',
        "Revisa: $(Join-Path $script:CarpetaLogs 'backend-errores.log')"
    )
}
Escribir-Ok "Esquema completo: $($esquema.tablas) tablas y cuenta de administrador lista."

# ------------------------------------------------------------
# 11. Datos de demostracion (solo si se acepto explicitamente)
# ------------------------------------------------------------
$lineasDemo = @()
if ($sembrarDemo) {
    Escribir-Paso 'Cargando datos de demostracion'
    # Barreras propias, ademas de la triple barrera del propio seedDev.js
    # (NODE_ENV, DEV_SEED y DB_HOST local), que NO se han tocado.
    if (-not $puedeOfrecerDemo) {
        Escribir-Aviso 'Cancelado: la base de destino no es la base local de demostracion.'
    } else {
        $salidaSeed  = Join-Path $script:CarpetaLogs 'datos-demo.log'
        $erroresSeed = Join-Path $script:CarpetaLogs 'datos-demo-errores.log'
        $env:DEV_SEED = 'true'
        try {
            $seed = Start-Process -FilePath (Obtener-RutaNode) -ArgumentList 'scripts/seedDev.js' `
                -WorkingDirectory $script:CarpetaServer -NoNewWindow -Wait -PassThru `
                -RedirectStandardOutput $salidaSeed -RedirectStandardError $erroresSeed
        } finally {
            Remove-Item Env:\DEV_SEED -ErrorAction SilentlyContinue
        }
        if ($seed.ExitCode -ne 0) {
            Mostrar-ColaLog -Ruta $erroresSeed -Lineas 15
            Escribir-Aviso 'No se pudieron cargar los datos de demostracion. La aplicacion funciona igual con la cuenta de administrador.'
        } else {
            Escribir-Ok 'Datos de demostracion cargados (son ficticios).'
            $contenidoSeed = Get-Content -Path $salidaSeed -Encoding UTF8 -ErrorAction SilentlyContinue
            foreach ($linea in $contenidoSeed) {
                if ($linea -match '^\s+•\s') { $lineasDemo += $linea.Trim() }
            }
        }
    }
}

# ------------------------------------------------------------
# 12. Arrancar la pagina web y esperar a que responda
# ------------------------------------------------------------
Escribir-Paso 'Iniciando la pagina web'
$procesoFrontend = Iniciar-Frontend
Escribir-Detalle "Proceso de la pagina: PID $($procesoFrontend.Id)"

$saludWeb = Esperar-Respuesta -Url $script:UrlFrontend -SegundosMax 60 -Proceso $procesoFrontend
if (-not $saludWeb.Ok) {
    Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'frontend-errores.log') -Lineas 15
    [void](Detener-Servicio 'frontend')
    Terminar-Con-Error 'La pagina web no llego a responder.' @(
        $saludWeb.Motivo,
        '',
        "Revisa el detalle en: $(Join-Path $script:CarpetaLogs 'frontend-errores.log')"
    )
}
Escribir-Ok "La pagina web responde en $($script:UrlFrontend)."

# ------------------------------------------------------------
# 13. Archivo de credenciales para el usuario
# ------------------------------------------------------------
$rutaCredenciales = Join-Path $script:Raiz 'CREDENCIALES.txt'
$textoCredenciales = @"
GamificApp — Credenciales de tu instalación local
Generado el $(Get-Date -Format 'yyyy-MM-dd HH:mm')

Cómo abrir la aplicación
  Página web : $($script:UrlFrontend)
  Servidor   : $($script:UrlBackend)

Cuenta de administrador
  Usuario     : admin
  Contraseña  : $claveAdmin

Base de datos MySQL
  Servidor : $($conexion.Servidor):$($conexion.Puerto)
  Base     : $($conexion.Base)
  Usuario  : $usuarioFinal
  Clave    : $claveFinal
"@
if ($usaPortable) {
    $textoCredenciales += @"

Dónde se guardan tus datos
  $($script:MySqlDatadir)

  Esa carpeta es la que contiene el trabajo de la escuela. NO está dentro de
  la carpeta de GamificApp a propósito: puedes borrar, mover o reemplazar la
  carpeta de GamificApp y tus datos seguirán ahí.
  Para hacer una copia de seguridad, copia esa carpeta con GamificApp cerrada.
"@
}
if ($lineasDemo.Count -gt 0) {
    $textoCredenciales += "`r`n`r`nCuentas de DEMOSTRACIÓN (datos ficticios, cargados en esta instalación)`r`n"
    foreach ($linea in $lineasDemo) { $textoCredenciales += "  $linea`r`n" }
}
$textoCredenciales += @"

------------------------------------------------------------
La clave de firma de sesiones (JWT_SECRET) NO se muestra aquí:
vive únicamente en server/.env.

Este archivo está ignorado por Git. No lo subas ni lo compartas.
------------------------------------------------------------
"@
[System.IO.File]::WriteAllText($rutaCredenciales, $textoCredenciales, (New-Object System.Text.UTF8Encoding($true)))
Escribir-Ok 'Credenciales guardadas en CREDENCIALES.txt (en la carpeta del proyecto).'

# ------------------------------------------------------------
# 14. Abrir el navegador y resumen
# ------------------------------------------------------------
Abrir-Navegador -Url $script:UrlFrontend

Write-Host ''
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   GAMIFICAPP ESTA LISTA" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Abrela en:  $($script:UrlFrontend)" -ForegroundColor White
Write-Host ''
Write-Host "   Entra como administrador con:" -ForegroundColor White
Write-Host "     Usuario:    admin" -ForegroundColor White
Write-Host "     Contrasena: (esta en CREDENCIALES.txt)" -ForegroundColor White
if ($lineasDemo.Count -gt 0) {
    Write-Host ''
    Write-Host "   Cuentas de demostracion (ficticias):" -ForegroundColor White
    foreach ($linea in $lineasDemo) { Write-Host "     $linea" -ForegroundColor White }
}
Write-Host ''
Write-Host "   A partir de ahora:" -ForegroundColor White
Write-Host "     · Para usarla otro dia:  Iniciar GamificApp.cmd" -ForegroundColor White
Write-Host "     · Para cerrarla:         Detener GamificApp.cmd" -ForegroundColor White
Write-Host ''
Escribir-Log 'Instalacion completada correctamente.' 'OK' $false
exit 0
