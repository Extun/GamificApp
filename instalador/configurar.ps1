# ============================================================
# GamificApp — Cambiar las opciones cuando quieras.
# Punto de entrada real: "Configurar GamificApp.cmd" (doble clic).
#
# Existe por una razon concreta: durante la instalacion las dos opciones se
# preguntan una sola vez y su valor por defecto es NO. Quien respondio que no
# —o quien lo penso mejor despues— tiene que poder cambiarlo sin reinstalar y
# sin editar ningun archivo a mano.
#
# NO instala nada, NO construye la pagina y NO toca la base de datos. Solo
# enciende o apaga:
#     1. el acceso desde otros dispositivos de la red,
#     2. el arranque automatico al iniciar sesion en Windows.
#
# Es seguro ejecutarlo tantas veces como haga falta, y salir sin tocar nada
# siempre es una opcion visible del menu.
# ============================================================
. (Join-Path $PSScriptRoot 'comun.ps1')
. (Join-Path $PSScriptRoot 'opciones.ps1')

Iniciar-Registro 'configurar'
Escribir-Titulo 'GamificApp — Configurar'

function Leer-Opcion {
    param([string[]]$Validas)
    while ($true) {
        $respuesta = (Read-Host '   Elige una opcion').Trim()
        if ($Validas -contains $respuesta) { return $respuesta }
        Write-Host "   Responde con uno de estos numeros: $($Validas -join ', ')" -ForegroundColor Yellow
    }
}

function Mostrar-Estado {
    $red    = Test-RedLocalActiva
    $tarea  = Test-ArranqueAutomaticoActivo

    Write-Host ''
    Write-Host '   COMO ESTA AHORA' -ForegroundColor White
    Write-Host '   ---------------' -ForegroundColor DarkGray

    if ($red) {
        $ip = Obtener-IPLocal
        Write-Host '     Acceso desde otros dispositivos . ACTIVADO' -ForegroundColor Green
        if ($ip) {
            Write-Host "       Direccion de hoy: http://${ip}:$($script:PuertoFrontend)" -ForegroundColor Cyan
        } else {
            Write-Host '       No se pudo averiguar la direccion: revisa la conexion de red.' -ForegroundColor Yellow
        }
        if (-not (Test-ReglaFirewall)) {
            Write-Host '       FALTA abrir el firewall de Windows (opcion 1 lo explica).' -ForegroundColor Yellow
        }
    } else {
        Write-Host '     Acceso desde otros dispositivos . desactivado' -ForegroundColor DarkGray
        Write-Host "       GamificApp solo se abre en este equipo." -ForegroundColor DarkGray
    }

    if ($tarea) {
        Write-Host '     Arranque automatico ............ ACTIVADO' -ForegroundColor Green
        if (Test-TareaApuntaAqui) {
            Write-Host '       Se inicia sola al iniciar sesion en Windows.' -ForegroundColor DarkGray
        } else {
            Write-Host '       AVISO: la tarea apunta a OTRA carpeta de GamificApp,' -ForegroundColor Yellow
            Write-Host '       probablemente porque esta se movio o se copio. Vuelve a' -ForegroundColor Yellow
            Write-Host '       activarla con la opcion 2 para que apunte aqui.' -ForegroundColor Yellow
        }
    } else {
        Write-Host '     Arranque automatico ............ desactivado' -ForegroundColor DarkGray
        Write-Host '       Hay que abrirla con "Iniciar GamificApp.cmd".' -ForegroundColor DarkGray
    }
    Write-Host ''
}

# ------------------------------------------------------------
# Opcion 1 — acceso desde otros dispositivos
# ------------------------------------------------------------
function Alternar-RedLocal {
    $activaAhora = Test-RedLocalActiva

    if ($activaAhora) {
        Escribir-Paso 'Desactivar el acceso desde otros dispositivos'
        Write-Host '   GamificApp volvera a abrirse SOLO en este equipo. Las tablets y los' -ForegroundColor White
        Write-Host '   demas equipos del aula dejaran de poder entrar.' -ForegroundColor White
        Write-Host '   No se pierde ningun dato: solo se cierra la puerta de la red.' -ForegroundColor White
        Write-Host ''
        if (-not (Preguntar-SiNo -Pregunta 'Confirmas que quieres desactivarlo?')) {
            Escribir-Detalle 'No se ha cambiado nada.'
            return $false
        }
        $resultado = Aplicar-RedLocal -Activar $false
        Mostrar-ResultadoRedLocal -Resultado $resultado

        # La regla de firewall se quita aparte: es lo unico que necesita
        # permisos de administrador, y dejarla puesta seria dejar dos puertos
        # abiertos sin que nada escuche detras.
        $firewall = Quitar-ReglaFirewall
        switch -Wildcard ($firewall) {
            'quitada'      { Escribir-Detalle 'Regla de firewall retirada.' }
            'no-estaba'    { }
            'sin-permisos' {
                Escribir-Aviso 'La regla del firewall sigue puesta: quitarla necesita permisos de administrador.'
                Escribir-Detalle 'No es peligroso dejarla (ya no hay nada escuchando), pero si quieres retirarla:'
                Write-Host ''
                Write-Host "     Remove-NetFirewallRule -DisplayName '$($script:NombreReglaFirewall)'" -ForegroundColor Cyan
                Write-Host ''
            }
            'error*'       { Escribir-Aviso "No se pudo quitar la regla de firewall. $firewall" }
        }
        return $true
    }

    Escribir-Paso 'Activar el acceso desde otros dispositivos'
    Write-Host '   Este equipo hara de servidor: cualquier tablet, telefono o portatil' -ForegroundColor White
    Write-Host '   conectado a la MISMA red podra abrir GamificApp desde su navegador,' -ForegroundColor White
    Write-Host '   sin instalar nada.' -ForegroundColor White
    Write-Host ''
    Write-Host '   Ten en cuenta que:' -ForegroundColor White
    Write-Host '     · Este equipo debe estar encendido y sin suspenderse.' -ForegroundColor White
    Write-Host '     · La conexion va sin cifrar (http). Es normal en la red de un aula,' -ForegroundColor White
    Write-Host '       pero no lo actives en una red publica o compartida con desconocidos.' -ForegroundColor White
    Write-Host '     · Solo alcanza a la red local: no expone GamificApp a internet.' -ForegroundColor White
    Write-Host ''
    if (-not (Preguntar-SiNo -Pregunta 'Quieres activarlo?')) {
        Escribir-Detalle 'No se ha cambiado nada.'
        return $false
    }

    $resultado = Aplicar-RedLocal -Activar $true
    Mostrar-ResultadoRedLocal -Resultado $resultado

    # El .env de la raiz hornea la direccion de la API dentro de dist\, asi
    # que manda sobre todo lo anterior. Si estorba, hay que reconstruir.
    $envFrontend = Revisar-EnvFrontend
    switch ($envFrontend) {
        'neutralizado' {
            Escribir-Aviso 'El archivo .env de la carpeta principal fijaba la direccion de la API a localhost.'
            Escribir-Detalle 'Se ha comentado esa linea, pero la pagina ya construida todavia la lleva dentro.'
            Escribir-Detalle 'Ejecuta "Instalar GamificApp.cmd" una vez para reconstruirla.'
        }
        'ajeno' {
            Escribir-Aviso 'El archivo .env de la carpeta principal apunta la API a un servidor concreto.'
            Escribir-Detalle 'No se ha tocado: es una decision tuya. Mientras siga ahi, los demas'
            Escribir-Detalle 'dispositivos usaran ese servidor y no este equipo.'
        }
    }
    return $true
}

# ------------------------------------------------------------
# Opcion 2 — arranque automatico
# ------------------------------------------------------------
function Alternar-ArranqueAutomatico {
    # Parentesis obligatorios: sin ellos PowerShell le pasaria "-and" a la
    # funcion como si fuera un parametro suyo.
    if ((Test-ArranqueAutomaticoActivo) -and (Test-TareaApuntaAqui)) {
        Escribir-Paso 'Desactivar el arranque automatico'
        Write-Host '   GamificApp dejara de iniciarse sola. Seguiras pudiendo abrirla' -ForegroundColor White
        Write-Host '   cuando quieras con "Iniciar GamificApp.cmd".' -ForegroundColor White
        Write-Host ''
        if (-not (Preguntar-SiNo -Pregunta 'Confirmas que quieres desactivarlo?')) {
            Escribir-Detalle 'No se ha cambiado nada.'
            return $false
        }
        $resultado = Quitar-TareaArranque
        switch -Wildcard ($resultado) {
            'quitada'   { Escribir-Ok 'Arranque automatico desactivado.' }
            'no-estaba' { Escribir-Ok 'No estaba activado.' }
            'error*'    { Escribir-Aviso "No se pudo quitar la tarea. $resultado" }
        }
        return $true
    }

    Escribir-Paso 'Activar el arranque automatico'
    Write-Host '   GamificApp se iniciara sola, en segundo plano, cada vez que INICIES' -ForegroundColor White
    Write-Host '   SESION en Windows en este equipo (unos 30 segundos despues, para dar' -ForegroundColor White
    Write-Host '   tiempo a que la red este lista).' -ForegroundColor White
    Write-Host ''
    Write-Host '   Importante: se activa al iniciar sesion, no al encender. Si quieres que' -ForegroundColor White
    Write-Host '   baste con pulsar el boton de encendido y marcharte, tendras que activar' -ForegroundColor White
    Write-Host '   ademas el inicio de sesion automatico de Windows por tu cuenta. Eso deja' -ForegroundColor White
    Write-Host '   el equipo desbloqueado para cualquiera que pase por delante: piensalo' -ForegroundColor White
    Write-Host '   antes de hacerlo.' -ForegroundColor White
    Write-Host ''
    Write-Host '   No se instala ningun servicio de Windows ni hacen falta permisos de' -ForegroundColor White
    Write-Host '   administrador, y podras quitarlo desde aqui mismo.' -ForegroundColor White
    Write-Host ''
    if (-not (Preguntar-SiNo -Pregunta 'Quieres activarlo?')) {
        Escribir-Detalle 'No se ha cambiado nada.'
        return $false
    }

    $resultado = Registrar-TareaArranque
    switch -Wildcard ($resultado) {
        'registrada' {
            Escribir-Ok 'Arranque automatico activado.'
            Escribir-Detalle "Tarea de Windows: $($script:NombreTareaArranque)"
            Escribir-Detalle 'Se puede ver y quitar tambien desde el Programador de tareas de Windows.'
        }
        'error*' {
            Escribir-Aviso "No se pudo crear la tarea. $resultado"
            Escribir-Detalle 'Puedes seguir abriendo GamificApp con "Iniciar GamificApp.cmd".'
        }
    }
    return $true
}

# ------------------------------------------------------------
# Menu
# ------------------------------------------------------------
$huboCambios = $false
$salir = $false

while (-not $salir) {
    Mostrar-Estado

    Write-Host '   QUE QUIERES HACER' -ForegroundColor White
    Write-Host '   -----------------' -ForegroundColor DarkGray
    Write-Host '     1  Acceso desde otros dispositivos de la red (activar o desactivar)' -ForegroundColor White
    Write-Host '     2  Arranque automatico al iniciar sesion (activar o desactivar)' -ForegroundColor White
    Write-Host '     0  Salir' -ForegroundColor White
    Write-Host ''

    switch (Leer-Opcion -Validas @('0', '1', '2')) {
        '1' { if (Alternar-RedLocal)          { $huboCambios = $true } }
        '2' { if (Alternar-ArranqueAutomatico) { $huboCambios = $true } }
        '0' { $salir = $true }
    }
}

# ------------------------------------------------------------
# Aplicar lo elegido
# ------------------------------------------------------------
# Vite decide en que interfaces escucha al arrancar, y el servidor lee
# CORS_ORIGIN una sola vez: los cambios no se notan hasta reiniciar. En vez de
# duplicar aqui esa logica, se llama al arranque diario, que ya sabe que hay
# que reiniciar y que no.
if ($huboCambios) {
    $enMarcha = (Obtener-EstadoServicio -Nombre 'frontend' -Puerto $script:PuertoFrontend -UrlSalud $script:UrlFrontend).Vivo

    Write-Host ''
    if ($enMarcha) {
        Write-Host '   GamificApp esta en marcha ahora mismo, y los cambios no se notan' -ForegroundColor Yellow
        Write-Host '   hasta que se reinicia.' -ForegroundColor Yellow
        Write-Host ''
        if (Preguntar-SiNo -Pregunta 'Quieres aplicarlos ahora (tarda unos segundos)?') {
            Write-Host ''
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'iniciar.ps1')
        } else {
            Write-Host '   Se aplicaran la proxima vez que ejecutes "Iniciar GamificApp.cmd".' -ForegroundColor White
        }
    } else {
        Write-Host '   Listo. Se aplicara en cuanto abras GamificApp con' -ForegroundColor White
        Write-Host '   "Iniciar GamificApp.cmd".' -ForegroundColor White
    }
} else {
    Write-Host ''
    Write-Host '   No se ha cambiado nada.' -ForegroundColor White
}

Write-Host ''
Escribir-Log "Configuracion terminada. Cambios: $huboCambios" 'OK' $false
exit 0
