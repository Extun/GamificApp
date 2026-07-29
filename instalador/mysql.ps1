# ============================================================
# GamificApp — Ciclo de vida de MySQL portable (Fase Local 2.2).
#
# Este archivo NO se ejecuta solo: lo cargan (dot-source) instalar.ps1,
# iniciar.ps1 y detener.ps1.
#
# Qué resuelve: que MySQL deje de ser un requisito previo. Se arranca el
# mysqld.exe oficial que viaja en runtime\mysql como un proceso de usuario
# más — sin servicio de Windows, sin Docker, sin instalador MSI y sin
# privilegios de administrador.
#
# ------------------------------------------------------------
# SEPARACIÓN ESENCIAL: runtime reemplazable / datos permanentes
# ------------------------------------------------------------
#   runtime\mysql                      → BINARIOS. Se puede borrar y volver
#                                         a poner. Está en .gitignore.
#   %LOCALAPPDATA%\GamificApp\         → DATOS. Sobreviven a Detener, a
#                                         Iniciar, a reiniciar Windows, a
#                                         reinstalar y a mover o reemplazar
#                                         la carpeta del proyecto.
#
# El datadir JAMÁS vive dentro de runtime\mysql: si viviera, actualizar los
# binarios borraría los datos de la escuela.
#
# ------------------------------------------------------------
# CÓMO SE IDENTIFICA NUESTRA INSTANCIA (hallazgo medido, no supuesto)
# ------------------------------------------------------------
# mysqld.exe se desdobla en DOS procesos y el PID que devuelve
# `Start-Process -PassThru` NO es el dueño del socket. Medición real sobre
# runtime\mysql\bin\mysqld.exe 8.0.44:
#
#   PID 38988  padre=PowerShell   CommandLine: ... --defaults-file="C:\...\my.ini"
#   PID 29532  padre=38988        CommandLine: ... --defaults-file=C:\...\my.ini
#   Dueño del socket 3316 -> PID 29532  (el HIJO, no el de Start-Process)
#   El pid-file que escribe mysqld contenía 29532 (el dueño real)
#   `mysqladmin shutdown` cerró LOS DOS (0 mysqld.exe vivos después)
#
# Por eso la identificación NUNCA se apoya en el PID registrado. Un mysqld es
# nuestro solo si cumple las dos condiciones a la vez:
#   1. ExecutablePath == runtime\mysql\bin\mysqld.exe  (ruta completa exacta)
#   2. su línea de comandos menciona NUESTRO my.ini
# La ruta del .ini se busca como SUBCADENA precisamente porque el padre la
# lleva entrecomillada y el hijo no: así el mismo predicado vale para ambos.
#
# Y para responder "¿lo que hay en el puerto N es nuestra base?" existe una
# prueba definitiva que no depende de procesos: conectarse y comparar
# @@datadir con el nuestro (Test-InstanciaEnPuerto).
#
# NUNCA se toca un proceso ajeno: ni un MySQL instalado, ni el de Docker, ni
# otro mysqld cualquiera. Si un puerto está ocupado por alguien que no somos
# nosotros, se prueba el siguiente.
# ============================================================

# ---- Runtime (binarios, reemplazables) ---------------------------------
$script:CarpetaMySqlRuntime = Join-Path $script:CarpetaRuntime 'mysql'
$script:MySqldExe           = Join-Path $script:CarpetaMySqlRuntime 'bin\mysqld.exe'
$script:MySqlAdminExe       = Join-Path $script:CarpetaMySqlRuntime 'bin\mysqladmin.exe'

# ---- Datos (permanentes, FUERA del proyecto) ---------------------------
$script:CarpetaAppDatos   = Join-Path $env:LOCALAPPDATA 'GamificApp'
$script:CarpetaMySqlDatos = Join-Path $script:CarpetaAppDatos 'mysql'
$script:MySqlDatadir      = Join-Path $script:CarpetaMySqlDatos 'datos'
$script:MySqlIni          = Join-Path $script:CarpetaMySqlDatos 'my.ini'
$script:MySqlErrorLog     = Join-Path $script:CarpetaMySqlDatos 'error.log'
$script:MySqlPidFile      = Join-Path $script:CarpetaMySqlDatos 'mysqld.pid'
$script:CarpetaSecretos   = Join-Path $script:CarpetaAppDatos 'secretos'
$script:MySqlRootSecreto  = Join-Path $script:CarpetaSecretos 'root.txt'
$script:ArchivoInstancia  = Join-Path $script:CarpetaAppDatos 'instancia.json'

# ---- Red ----------------------------------------------------------------
# 3308 preferido. 3306 y 3307 quedan FUERA de la lista a propósito: son los
# puertos de un MySQL instalado y del contenedor Docker de desarrollo.
$script:MySqlHost            = '127.0.0.1'
$script:MySqlPuertoPreferido = 3308
$script:MySqlPuertosFallback = @(3309, 3310, 3311, 3312, 3313, 3314, 3315)

# Versión del formato de instancia.json. Si algún día cambia la estructura,
# esto permite migrarla sin adivinar.
$script:InstanciaVersionFormato = 1

# ------------------------------------------------------------
# Utilidades de ruta
# ------------------------------------------------------------
# Compara dos rutas por su forma canónica (mayúsculas y separadores aparte).
function Test-MismaRuta {
    param([string]$A, [string]$B)
    if (-not $A -or -not $B) { return $false }
    try {
        $ca = [System.IO.Path]::GetFullPath($A).TrimEnd('\')
        $cb = [System.IO.Path]::GetFullPath($B).TrimEnd('\')
        return ($ca -eq $cb)
    } catch { return $false }
}

# my.ini lo lee mysqld con la página de códigos ANSI del sistema, no UTF-8.
# Si la ruta contiene caracteres que esa codificación no puede representar,
# el archivo llegaría corrupto y mysqld no encontraría su datadir.
#
# La prueba de viabilidad confirmó que espacios y ñ/tildes funcionan tal cual
# en un Windows en español, así que NO se fuerza nada: solo se comprueba el
# viaje de ida y vuelta y, si de verdad se pierde algo (por ejemplo un
# usuario con nombre cirílico en una máquina Latin-1), se recurre a la ruta
# corta 8.3, que es ASCII pura por definición.
function Obtener-RutaParaIni {
    param([string]$Ruta, [switch]$EsCarpetaExistente)
    $ansi = [System.Text.Encoding]::Default
    if ($ansi.GetString($ansi.GetBytes($Ruta)) -eq $Ruta) {
        return ($Ruta -replace '\\', '/')
    }
    Escribir-Log "La ruta '$Ruta' no sobrevive a la codificacion $($ansi.WebName); se intenta la ruta corta 8.3." 'AVISO' $false
    if ($EsCarpetaExistente -and (Test-Path $Ruta)) {
        try {
            $corta = (New-Object -ComObject Scripting.FileSystemObject).GetFolder($Ruta).ShortPath
            if ($corta) { return ($corta -replace '\\', '/') }
        } catch { }
    }
    Terminar-Con-Error 'La carpeta de datos de GamificApp tiene caracteres que MySQL no puede leer.' @(
        "Ruta afectada: $Ruta",
        '',
        'Que hacer:',
        '  Usa una cuenta de Windows cuyo nombre no tenga caracteres especiales,',
        '  o instala GamificApp desde otra cuenta.'
    )
}

# ------------------------------------------------------------
# Disponibilidad del runtime portable
# ------------------------------------------------------------
function Test-MySqlPortableDisponible {
    return ((Test-Path $script:MySqldExe) -and (Test-Path $script:MySqlAdminExe))
}

# ------------------------------------------------------------
# Runtime de Visual C++ (app-local) — comprobación previa
# ------------------------------------------------------------
# mysqld.exe, mysql.exe, mysqladmin.exe y mysqldump.exe importan de forma
# ESTÁTICA vcruntime140.dll, vcruntime140_1.dll y msvcp140.dll. Windows no
# las trae de fábrica: en un equipo recién instalado faltan y el proceso ni
# siquiera llega a arrancar (no son delay-load, así que no hay mensaje de
# error de MySQL: falla el cargador de Windows).
#
# Por eso la distribución las lleva JUNTO a los ejecutables, dentro de
# runtime\mysql\bin: Windows busca primero en el directorio del ejecutable.
# Las prepara instalador\runtime.ps1 al armar el paquete; aquí solo se
# comprueba que llegaron, ANTES de intentar arrancar nada.
$script:VcRuntimeDlls = @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')

function Test-VcRuntimeMySql {
    $carpetaBin = Split-Path -Parent $script:MySqldExe
    $faltanLocal = @()
    foreach ($dll in $script:VcRuntimeDlls) {
        if (-not (Test-Path (Join-Path $carpetaBin $dll))) { $faltanLocal += $dll }
    }
    if ($faltanLocal.Count -eq 0) { return }

    # No están junto al ejecutable. ¿Las tiene instaladas el equipo? Si sí,
    # MySQL funcionará igual AQUÍ, pero esta copia está incompleta para
    # llevarla a otro sitio: se avisa sin bloquear el trabajo.
    $faltanSistema = @()
    foreach ($dll in $faltanLocal) {
        if (-not (Test-Path (Join-Path $env:WINDIR "System32\$dll"))) { $faltanSistema += $dll }
    }
    if ($faltanSistema.Count -eq 0) {
        Escribir-Aviso "Faltan junto a MySQL: $($faltanLocal -join ', '). Este equipo las tiene instaladas, asi que funcionara aqui, pero esta copia NO serviria en un equipo sin Visual C++."
        return
    }

    Terminar-Con-Error 'Faltan componentes que necesita la base de datos para arrancar.' @(
        "No se encontraron: $($faltanSistema -join ', ')",
        '',
        'Forman parte del "Microsoft Visual C++ Redistributable (x64)". GamificApp',
        'los distribuye junto a su base de datos precisamente para que no haga',
        'falta instalarlos, pero en esta copia no estan.',
        '',
        'Que hacer:',
        '  1. Vuelve a descargar GamificApp completa (sin extraer a medias).',
        '  2. Ejecuta otra vez "Instalar GamificApp.cmd".',
        '',
        'Alternativa: instalar "Microsoft Visual C++ Redistributable (x64)" desde',
        'https://aka.ms/vs/17/release/vc_redist.x64.exe  (pide permisos de',
        'administrador; con la copia completa de GamificApp no hace falta).'
    )
}

function Obtener-VersionMySqlPortable {
    if (-not (Test-Path $script:MySqldExe)) { return $null }
    try {
        $texto = (& $script:MySqldExe --version) | Select-Object -First 1
        if ($texto -match 'Ver\s+([0-9]+\.[0-9]+\.[0-9]+)') { return $Matches[1] }
        return $null
    } catch { return $null }
}

# ------------------------------------------------------------
# instancia.json — cómo volver a encontrar la base tras mover el proyecto
# ------------------------------------------------------------
# Contiene SOLO lo necesario para reconstruir la conexión. Nunca guarda
# JWT_SECRET ni contraseñas: las credenciales viven en archivos aparte
# (secretos\root.txt) y en server\.env.
function Leer-Instancia {
    if (-not (Test-Path $script:ArchivoInstancia)) { return $null }
    try { return (Get-Content -Path $script:ArchivoInstancia -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { return $null }
}

function Guardar-Instancia {
    param([int]$Puerto, [string]$Base, [string]$UsuarioApp)
    if (-not (Test-Path $script:CarpetaAppDatos)) {
        New-Item -ItemType Directory -Path $script:CarpetaAppDatos -Force | Out-Null
    }
    $previa = Leer-Instancia
    $creada = $(if ($previa -and $previa.creada) { $previa.creada } else { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') })
    $datos = [pscustomobject]@{
        version       = $script:InstanciaVersionFormato
        producto      = 'GamificApp'
        motor         = 'mysql-portable'
        motorVersion  = (Obtener-VersionMySqlPortable)
        # Informativo: la carpeta del proyecto puede moverse y esta ruta
        # quedar obsoleta. La instancia NO depende de ella para funcionar.
        runtimeRuta   = $script:CarpetaMySqlRuntime
        host          = $script:MySqlHost
        puerto        = $Puerto
        datadir       = $script:MySqlDatadir
        dbName        = $Base
        dbUser        = $UsuarioApp
        creada        = $creada
        actualizada   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    }
    $datos | ConvertTo-Json | Out-File -FilePath $script:ArchivoInstancia -Encoding utf8
}

# ------------------------------------------------------------
# Secreto de root — la credencial administrativa persistente
# ------------------------------------------------------------
# Es la que permite reconstruir server\.env si el usuario reemplaza la
# carpeta del proyecto conservando sus datos.
function Leer-ClaveRoot {
    if (-not (Test-Path $script:MySqlRootSecreto)) { return $null }
    try {
        $valor = (Get-Content -Path $script:MySqlRootSecreto -Raw -Encoding UTF8).Trim()
        if ($valor) { Registrar-Secreto $valor; return $valor }
        return $null
    } catch { return $null }
}

function Guardar-ClaveRoot {
    param([string]$Clave)
    if (-not (Test-Path $script:CarpetaSecretos)) {
        New-Item -ItemType Directory -Path $script:CarpetaSecretos -Force | Out-Null
    }
    Escribir-TextoSinBom -Ruta $script:MySqlRootSecreto -Contenido $Clave
    # Deja el archivo accesible SOLO para la cuenta actual: se corta la
    # herencia del padre y se deja una única regla. Si el sistema de archivos
    # no lo permite, se avisa pero no se aborta: %LOCALAPPDATA% ya es una
    # carpeta por usuario.
    try {
        $acl = Get-Acl -Path $script:MySqlRootSecreto
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($r in @($acl.Access)) { [void]$acl.RemoveAccessRule($r) }
        $yo = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $regla = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $yo, 'FullControl', 'None', 'None', 'Allow')
        $acl.AddAccessRule($regla)
        Set-Acl -Path $script:MySqlRootSecreto -AclObject $acl
    } catch {
        Escribir-Log "No se pudieron restringir los permisos de root.txt: $($_.Exception.Message)" 'AVISO' $false
    }
    Registrar-Secreto $Clave
}

# ------------------------------------------------------------
# my.ini
# ------------------------------------------------------------
function Escribir-MySqlIni {
    param([int]$Puerto)
    if (-not (Test-Path $script:CarpetaMySqlDatos)) {
        New-Item -ItemType Directory -Path $script:CarpetaMySqlDatos -Force | Out-Null
    }
    $contenido = @"
# Configuracion de la instancia MySQL portable de GamificApp.
# La REGENERA el instalador en cada ejecucion: no la edites a mano.
[mysqld]
basedir="$(Obtener-RutaParaIni -Ruta $script:CarpetaMySqlRuntime -EsCarpetaExistente)"
datadir="$(Obtener-RutaParaIni -Ruta $script:MySqlDatadir)"
port=$Puerto
# Solo loopback: la base NUNCA queda expuesta a la red de la escuela.
bind-address=$script:MySqlHost
# Sin X Protocol (puerto 33060): la aplicacion no lo usa.
mysqlx=0
log-error="$(Obtener-RutaParaIni -Ruta $script:MySqlErrorLog)"
pid-file="$(Obtener-RutaParaIni -Ruta $script:MySqlPidFile)"
character-set-server=utf8mb4
collation-server=utf8mb4_spanish_ci
# Equipos de escuela: memoria contenida a proposito.
innodb_buffer_pool_size=128M
"@
    # ANSI del sistema: es como lee mysqld este archivo en Windows.
    [System.IO.File]::WriteAllText($script:MySqlIni, $contenido, [System.Text.Encoding]::Default)
}

# ------------------------------------------------------------
# Identificación de procesos (ver cabecera: HALLAZGO del doble proceso)
# ------------------------------------------------------------
# Un mysqld es NUESTRO solo si su ejecutable es exactamente el de
# runtime\mysql Y su línea de comandos apunta a nuestro my.ini. Vale igual
# para el proceso padre (que lleva la ruta entrecomillada) y para el hijo
# dueño del socket (que la lleva sin comillas).
function Test-MysqldPropio {
    param($Info)
    if (-not $Info) { return $false }
    if ("$($Info.Name)" -ne 'mysqld.exe') { return $false }
    if (-not (Test-MismaRuta $Info.ExecutablePath $script:MySqldExe)) { return $false }
    if (-not $Info.CommandLine) { return $false }
    if ($Info.CommandLine -notlike "*$script:MySqlIni*") { return $false }
    return $true
}

# Devuelve TODOS los procesos mysqld de nuestra instancia: padre e hijo.
function Obtener-MysqldPropios {
    $todos = @(Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" -ErrorAction SilentlyContinue)
    return @($todos | Where-Object { Test-MysqldPropio $_ })
}

# ¿Quién ocupa el puerto y es de los nuestros?
# Devuelve: Libre | Nuestro | Ajeno, con el detalle del ocupante.
function Obtener-EstadoPuertoMySql {
    param([int]$Puerto)
    $dueno = Obtener-DuenoPuerto -Puerto $Puerto
    if (-not $dueno) {
        return [pscustomobject]@{ Estado = 'Libre'; ProcesoId = 0; Nombre = ''; }
    }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$($dueno.ProcesoId)" -ErrorAction SilentlyContinue
    if (Test-MysqldPropio $info) {
        return [pscustomobject]@{ Estado = 'Nuestro'; ProcesoId = $dueno.ProcesoId; Nombre = $dueno.Nombre }
    }
    return [pscustomobject]@{ Estado = 'Ajeno'; ProcesoId = $dueno.ProcesoId; Nombre = $dueno.Nombre }
}

# Prueba DEFINITIVA e independiente de los procesos: se conecta al puerto y
# compara el @@datadir que declara el servidor con el nuestro. Si coinciden,
# lo que hay ahí es nuestra base, venga del proceso que venga.
function Test-InstanciaEnPuerto {
    param([int]$Puerto, [string]$ClaveRoot)
    if (-not (Test-PuertoTcpAbierto -Servidor $script:MySqlHost -Puerto $Puerto -TimeoutMs 1200)) { return $false }
    $r = Invocar-ScriptBD -Script 'bd-verificar.mjs' -Variables @{
        GA_DB_HOST     = $script:MySqlHost
        GA_DB_PORT     = "$Puerto"
        GA_DB_USER     = 'root'
        GA_DB_PASSWORD = $ClaveRoot
    }
    if (-not $r -or -not $r.ok -or -not $r.datadir) { return $false }
    return (Test-MismaRuta $r.datadir $script:MySqlDatadir)
}

# ------------------------------------------------------------
# Selección de puerto
# ------------------------------------------------------------
# Orden: el puerto que ya usaba la instancia (si lo hay) y después
# 3308 → 3309 … 3315. Un puerto ocupado por un proceso AJENO se salta; jamás
# se le hace nada.
function Seleccionar-PuertoMySql {
    $candidatos = @()
    $instancia = Leer-Instancia
    if ($instancia -and $instancia.puerto) { $candidatos += [int]$instancia.puerto }
    $candidatos += $script:MySqlPuertoPreferido
    $candidatos += $script:MySqlPuertosFallback
    $vistos = @{}

    foreach ($puerto in $candidatos) {
        if ($vistos.ContainsKey($puerto)) { continue }
        $vistos[$puerto] = $true
        $estado = Obtener-EstadoPuertoMySql -Puerto $puerto
        if ($estado.Estado -eq 'Libre') {
            return [pscustomobject]@{ Puerto = $puerto; YaEnMarcha = $false }
        }
        if ($estado.Estado -eq 'Nuestro') {
            Escribir-Detalle "El puerto $puerto ya lo atiende nuestra propia instancia (PID $($estado.ProcesoId)): se reutiliza."
            return [pscustomobject]@{ Puerto = $puerto; YaEnMarcha = $true }
        }
        Escribir-Detalle "Puerto $puerto ocupado por $($estado.Nombre) (PID $($estado.ProcesoId)), que NO es de GamificApp: se prueba el siguiente."
    }

    Terminar-Con-Error 'No queda ningun puerto libre para la base de datos de GamificApp.' @(
        "Se probaron el $script:MySqlPuertoPreferido y del $($script:MySqlPuertosFallback[0]) al $($script:MySqlPuertosFallback[-1]).",
        'Todos estan ocupados por otros programas, y GamificApp no cierra programas ajenos.',
        '',
        'Que hacer:',
        '  1. Cierra alguno de los programas que usan esos puertos.',
        '  2. Vuelve a ejecutar este archivo.'
    )
}

# ------------------------------------------------------------
# Diagnóstico
# ------------------------------------------------------------
function Mostrar-DiagnosticoMySql {
    param([string]$Titulo = 'Ultimas lineas del registro de MySQL')
    if (-not (Test-Path $script:MySqlErrorLog)) { return }
    $lineas = Get-Content -Path $script:MySqlErrorLog -Tail 15 -ErrorAction SilentlyContinue
    if (-not $lineas) { return }
    Write-Host ''
    Write-Host "   ${Titulo}:" -ForegroundColor DarkGray
    foreach ($l in $lineas) { Write-Host "     $(Censurar $l)" -ForegroundColor DarkGray }
}

# ------------------------------------------------------------
# Arranque
# ------------------------------------------------------------
# Espera activa REAL: el puerto tiene que aceptar conexiones. Si el proceso
# se muere por el camino, corta al instante y enseña el error.log en vez de
# agotar el tiempo en silencio.
function Esperar-MySqlListo {
    param([int]$Puerto, [System.Diagnostics.Process]$Proceso, [int]$SegundosMax = 90)
    $limite = (Get-Date).AddSeconds($SegundosMax)
    while ((Get-Date) -lt $limite) {
        if (Test-PuertoTcpAbierto -Servidor $script:MySqlHost -Puerto $Puerto -TimeoutMs 1000) { return $true }
        # El PID de Start-Process es el padre: si MUERE, no ha quedado nada
        # en pie (el hijo no sobrevive a un arranque fallido).
        if ($Proceso -and $Proceso.HasExited) {
            $quedan = Obtener-MysqldPropios
            if ($quedan.Count -eq 0) { return $false }
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Iniciar-MySqlPortable {
    param([int]$Puerto)
    Escribir-MySqlIni -Puerto $Puerto
    $proceso = Start-Process -FilePath $script:MySqldExe `
        -ArgumentList "--defaults-file=`"$script:MySqlIni`"" `
        -WindowStyle Hidden -PassThru

    if (-not (Esperar-MySqlListo -Puerto $Puerto -Proceso $proceso)) {
        Mostrar-DiagnosticoMySql
        Terminar-Con-Error 'La base de datos de GamificApp no llego a arrancar.' @(
            "MySQL portable no respondio en $($script:MySqlHost):$Puerto.",
            '',
            "Registro completo en: $script:MySqlErrorLog",
            '',
            'Causas habituales:',
            '  · Un antivirus esta bloqueando el programa de la base de datos.',
            '  · No queda espacio en disco.'
        )
    }
    # Se devuelve el PID del proceso padre solo como dato informativo: la
    # identificacion real NO se apoya en el (ver cabecera).
    return [pscustomobject]@{ Puerto = $Puerto; ProcesoIdPadre = $proceso.Id }
}

# ------------------------------------------------------------
# Inicialización de un datadir NUEVO
# ------------------------------------------------------------
# Solo se llama cuando el datadir no existe. NUNCA borra un datadir previo:
# los datos de la escuela no se sacrifican para "arreglar" una instalación.
function Inicializar-MySqlPortable {
    param([int]$Puerto)

    if (Test-Path $script:MySqlDatadir) {
        Terminar-Con-Error 'Se intento inicializar una base de datos que ya existe.' @(
            "Carpeta: $script:MySqlDatadir",
            'GamificApp nunca borra datos existentes. Si quieres empezar de cero,',
            'mueve o borra esa carpeta tu mismo y vuelve a ejecutar el instalador.'
        )
    }

    Escribir-Detalle 'Creando la base de datos por primera vez. Puede tardar medio minuto...'
    New-Item -ItemType Directory -Path $script:CarpetaMySqlDatos -Force | Out-Null
    Escribir-MySqlIni -Puerto $Puerto

    # --initialize-insecure crea root@localhost SIN contraseña. Es un estado
    # transitorio de segundos: justo después se le pone una aleatoria.
    & $script:MySqldExe "--defaults-file=$script:MySqlIni" --initialize-insecure
    $codigo = $LASTEXITCODE
    if ($codigo -ne 0 -or -not (Test-Path $script:MySqlDatadir)) {
        Mostrar-DiagnosticoMySql
        Terminar-Con-Error 'No se pudo crear la base de datos de GamificApp.' @(
            "El programa de la base de datos termino con el codigo $codigo.",
            '',
            "Registro completo en: $script:MySqlErrorLog"
        )
    }
    Escribir-Ok 'Base de datos creada.'
}

# Pone una contraseña aleatoria a root justo después de inicializar y la
# guarda fuera del repositorio. La contraseña viaja por variables de entorno,
# nunca por la línea de comandos (que es visible en la lista de procesos).
function Proteger-RootMySql {
    param([int]$Puerto)
    $clave = Nueva-ClaveLegible -Longitud 24
    Registrar-Secreto $clave

    $r = Invocar-ScriptBD -Script 'mysql-clave-root.mjs' -Variables @{
        GA_DB_HOST      = $script:MySqlHost
        GA_DB_PORT      = "$Puerto"
        GA_DB_PASSWORD  = ''
        GA_ROOT_NUEVA   = $clave
    }
    if (-not $r -or -not $r.ok) {
        Terminar-Con-Error 'No se pudo proteger la base de datos con una contrasena.' @(
            "Detalle: $(if ($r) { $r.error } else { 'sin respuesta' })",
            '',
            'Por seguridad la instalacion se detiene aqui: GamificApp no deja una',
            'base de datos sin contrasena.'
        )
    }
    Guardar-ClaveRoot -Clave $clave
    Escribir-Ok 'Base de datos protegida con una contrasena aleatoria.'
    return $clave
}

# ------------------------------------------------------------
# Parada
# ------------------------------------------------------------
# Cierre ordenado con `mysqladmin shutdown`, que —medido— cierra tanto el
# proceso padre como el hijo dueño del socket. La contraseña se pasa por la
# variable de entorno MYSQL_PWD y NO como argumento: en Windows la línea de
# comandos de cualquier proceso es legible, pero su entorno no.
function Detener-MySqlPortable {
    $instancia = Leer-Instancia
    if (-not $instancia -or -not $instancia.puerto) {
        # Sin instancia registrada no hay nada nuestro que parar. Aun así se
        # comprueba si quedó algún mysqld propio suelto.
        $sueltos = Obtener-MysqldPropios
        if ($sueltos.Count -eq 0) { return 'no-estaba' }
    }
    $puerto = $(if ($instancia -and $instancia.puerto) { [int]$instancia.puerto } else { $script:MySqlPuertoPreferido })

    $procesos = Obtener-MysqldPropios
    if ($procesos.Count -eq 0) { return 'no-estaba' }

    $clave = Leer-ClaveRoot
    if ($null -eq $clave) { $clave = '' }

    $previa = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $clave
        & $script:MySqlAdminExe --protocol=TCP --host=$script:MySqlHost --port=$puerto --user=root shutdown 2>$null | Out-Null
        $codigo = $LASTEXITCODE
    } finally {
        if ($null -eq $previa) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue }
        else { $env:MYSQL_PWD = $previa }
    }

    # Confirmación real de que se fueron TODOS (padre e hijo), no un sleep.
    $limite = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $limite) {
        if ((Obtener-MysqldPropios).Count -eq 0) { return 'detenido' }
        Start-Sleep -Milliseconds 400
    }

    # Último recurso, y solo sobre procesos que han pasado las DOS
    # comprobaciones de pertenencia: un mysqld ajeno nunca llega aquí.
    Escribir-Aviso "El cierre ordenado no termino (codigo $codigo). Se cierran los procesos propios uno a uno."
    foreach ($p in (Obtener-MysqldPropios)) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { }
    }
    $limite = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $limite) {
        if ((Obtener-MysqldPropios).Count -eq 0) { return 'detenido-forzado' }
        Start-Sleep -Milliseconds 300
    }
    return 'sigue-vivo'
}

# ------------------------------------------------------------
# ¿El server\.env apunta a NUESTRA instancia portable?
# ------------------------------------------------------------
function Test-EnvEsInstanciaPortable {
    param([string]$Servidor, [int]$Puerto)
    $instancia = Leer-Instancia
    if (-not $instancia -or -not $instancia.puerto) { return $false }
    if ([int]$instancia.puerto -ne $Puerto) { return $false }
    return ($Servidor -eq $script:MySqlHost -or $Servidor -eq 'localhost' -or $Servidor -eq '::1')
}

# ------------------------------------------------------------
# ORQUESTADOR — lo que llama instalar.ps1
# ------------------------------------------------------------
# Deja la instancia portable EN MARCHA y devuelve credenciales de
# administración (root) para que el resto del instalador siga su curso
# normal con bd-preparar.mjs / bd-verificar.mjs / initDb.js.
#
# Tres caminos, y ninguno destruye datos:
#   · datadir nuevo      → inicializa, protege root, registra la instancia.
#   · datadir existente  → NO inicializa. Arranca y reutiliza root.txt.
#   · ya está en marcha  → no lanza una segunda instancia.
function Preparar-MySqlPortable {
    param([string]$Base)

    Escribir-Paso 'Preparando la base de datos portable de GamificApp'
    # Antes de nada: sin el runtime de Visual C++ mysqld ni arranca, y el
    # fallo del cargador de Windows no deja rastro en ningun log de MySQL.
    Test-VcRuntimeMySql
    $version = Obtener-VersionMySqlPortable
    Escribir-Ok "MySQL $version portable (incluido con GamificApp)."
    Escribir-Detalle $script:CarpetaMySqlRuntime
    Escribir-Detalle "Tus datos se guardan en: $script:MySqlDatadir"

    $datadirExistia = Test-Path $script:MySqlDatadir
    $seleccion = Seleccionar-PuertoMySql
    $puerto = $seleccion.Puerto

    # Si ya hay datos, manda el nombre de base que quedo registrado en
    # instancia.json: es donde estan de verdad. Ignorarlo crearia una base
    # vacia al lado de la que tiene el trabajo de la escuela.
    $instanciaPrevia = Leer-Instancia
    if ($datadirExistia -and $instanciaPrevia -and $instanciaPrevia.dbName -and $instanciaPrevia.dbName -ne $Base) {
        Escribir-Detalle "Se usara la base ya registrada '$($instanciaPrevia.dbName)' en lugar de '$Base'."
        $Base = $instanciaPrevia.dbName
    }

    if ($seleccion.YaEnMarcha) {
        # Reutilización: ya hay una instancia nuestra atendiendo ese puerto.
        $clave = Leer-ClaveRoot
        if ($null -eq $clave) {
            Terminar-Con-Error 'La base de datos esta en marcha pero falta su contrasena.' @(
                "No se encontro: $script:MySqlRootSecreto",
                '',
                'Que hacer:',
                '  1. Ejecuta "Detener GamificApp.cmd".',
                '  2. Vuelve a ejecutar este archivo.'
            )
        }
        Escribir-Ok "La base de datos ya estaba en marcha en el puerto ${puerto}: se reutiliza."
    } elseif ($datadirExistia) {
        # Los datos ya existen: se arranca SIN inicializar nada.
        Escribir-Ok 'Se encontraron datos de una instalacion anterior: se conservan.'
        $clave = Leer-ClaveRoot
        if ($null -eq $clave) {
            Terminar-Con-Error 'Se encontraron datos anteriores pero no su contrasena de administracion.' @(
                "Datos en   : $script:MySqlDatadir",
                "Falta      : $script:MySqlRootSecreto",
                '',
                'Sin esa contrasena no se puede abrir la base de datos, y GamificApp',
                'NUNCA borra datos para arreglar una instalacion.',
                '',
                'Que hacer:',
                '  Si esos datos ya no te sirven, mueve esa carpeta a otro sitio y',
                '  vuelve a ejecutar este archivo para empezar de cero.'
            )
        }
        [void](Iniciar-MySqlPortable -Puerto $puerto)
        Escribir-Ok "Base de datos en marcha en el puerto $puerto (datos anteriores intactos)."
    } else {
        # Primera vez de verdad.
        Inicializar-MySqlPortable -Puerto $puerto
        [void](Iniciar-MySqlPortable -Puerto $puerto)
        Escribir-Ok "Base de datos en marcha en el puerto $puerto."
        $clave = Proteger-RootMySql -Puerto $puerto
    }

    Guardar-Instancia -Puerto $puerto -Base $Base -UsuarioApp $script:UsuarioAppMySQL

    return [pscustomobject]@{
        Servidor  = $script:MySqlHost
        Puerto    = $puerto
        Usuario   = 'root'
        Clave     = $clave
        Base      = $Base
        Version   = $version
        EsNueva   = (-not $datadirExistia)
    }
}

# ------------------------------------------------------------
# Lo que llaman iniciar.ps1 y instalar.ps1 cuando YA hay server\.env
# ------------------------------------------------------------
# Se limita a garantizar que nuestra instancia está en marcha en el puerto
# que dice server\.env. No inicializa, no crea usuarios y no toca datos.
function Asegurar-MySqlPortableEnMarcha {
    param([int]$Puerto)

    if (-not (Test-MySqlPortableDisponible)) {
        Terminar-Con-Error 'Falta el programa de la base de datos de GamificApp.' @(
            "Se esperaba: $script:MySqldExe",
            '',
            'Que hacer:',
            '  Vuelve a descargar GamificApp completa y ejecuta "Instalar GamificApp.cmd".'
        )
    }
    Test-VcRuntimeMySql

    $estado = Obtener-EstadoPuertoMySql -Puerto $Puerto
    if ($estado.Estado -eq 'Nuestro') {
        Escribir-Ok "La base de datos ya estaba en marcha (puerto $Puerto). No se inicia otra vez."
        return $true
    }
    if ($estado.Estado -eq 'Ajeno') {
        Terminar-Con-Error "El puerto $Puerto de la base de datos lo esta usando otro programa." @(
            "Lo ocupa: $($estado.Nombre) (PID $($estado.ProcesoId))",
            '',
            'Que hacer:',
            '  1. Cierra ese programa.',
            '  2. Vuelve a ejecutar este archivo.'
        )
    }

    if (-not (Test-Path $script:MySqlDatadir)) {
        Terminar-Con-Error 'No se encuentran los datos de GamificApp.' @(
            "Se esperaban en: $script:MySqlDatadir",
            '',
            'Que hacer:',
            '  Ejecuta "Instalar GamificApp.cmd" para crear la base de datos.'
        )
    }

    Escribir-Detalle 'Iniciando la base de datos...'
    [void](Iniciar-MySqlPortable -Puerto $Puerto)
    Escribir-Ok "Base de datos en marcha (puerto $Puerto)."
    return $true
}
