# ============================================================
# GamificApp — Detener la aplicacion.
# Punto de entrada real: "Detener GamificApp.cmd" (doble clic).
#
# SOLO detiene los procesos que arranco GamificApp, identificados por el PID
# que quedo registrado en .run\ y verificados por su linea de comandos.
#
# NUNCA usa "taskkill /IM node.exe": eso cerraria de golpe cualquier otra
# aplicacion Node que el usuario tuviera abierta.
#
# La base de datos portable se cierra en ULTIMO lugar y de forma ordenada
# (mysqladmin shutdown), cuando ya nadie la esta usando. NO se borra nada:
# los datos siguen en %LOCALAPPDATA%\GamificApp\ para la proxima vez.
# Un MySQL que no sea el nuestro (uno instalado, o el de Docker) no se toca.
# ============================================================
. (Join-Path $PSScriptRoot 'comun.ps1')
. (Join-Path $PSScriptRoot 'mysql.ps1')

Iniciar-Registro 'detener'
Escribir-Titulo 'GamificApp — Detener'

$servicios = @(
    [pscustomobject]@{ Clave = 'frontend'; Titulo = 'Pagina web'; Puerto = $script:PuertoFrontend },
    [pscustomobject]@{ Clave = 'backend';  Titulo = 'Servidor';   Puerto = $script:PuertoBackend }
)

$detenidos = 0
$ajenos = @()

foreach ($servicio in $servicios) {
    Escribir-Paso "Deteniendo: $($servicio.Titulo)"
    $registro = Leer-Proceso $servicio.Clave
    $resultado = Detener-Servicio $servicio.Clave

    switch ($resultado) {
        'detenido' {
            $detenidos++
            Escribir-Ok "$($servicio.Titulo) detenido (PID $($registro.pid))."
        }
        'no-estaba' {
            Escribir-Detalle "$($servicio.Titulo): no estaba en ejecucion."
        }
        'sin-registro' {
            Escribir-Detalle "$($servicio.Titulo): no estaba en ejecucion."
        }
        default {
            Escribir-Aviso "No se pudo detener $($servicio.Titulo). $resultado"
        }
    }

    # Si el puerto sigue ocupado por algo que NO arrancamos nosotros, se avisa
    # pero no se toca: podria ser otra aplicacion del usuario.
    $dueno = Obtener-DuenoPuerto -Puerto $servicio.Puerto
    if ($dueno) {
        $ajenos += [pscustomobject]@{ Puerto = $servicio.Puerto; Dueno = $dueno }
    }
}

# ------------------------------------------------------------
# La base de datos, al final: primero se van los que la usan.
# ------------------------------------------------------------
if (Test-MySqlPortableDisponible) {
    Escribir-Paso 'Deteniendo: Base de datos'
    $resultadoBd = Detener-MySqlPortable
    switch ($resultadoBd) {
        'detenido' {
            $detenidos++
            Escribir-Ok 'Base de datos detenida (cierre ordenado).'
        }
        'detenido-forzado' {
            $detenidos++
            Escribir-Aviso 'Base de datos detenida, pero hizo falta cerrarla a la fuerza.'
        }
        'no-estaba' {
            Escribir-Detalle 'Base de datos: no estaba en ejecucion.'
        }
        default {
            Escribir-Aviso 'No se pudo detener la base de datos. Ejecuta este archivo otra vez.'
        }
    }
}

Write-Host ''
if ($detenidos -gt 0) {
    Write-Host "  ============================================================" -ForegroundColor Green
    Write-Host "   GAMIFICAPP SE HA DETENIDO" -ForegroundColor Green
    Write-Host "  ============================================================" -ForegroundColor Green
} else {
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host "   GAMIFICAPP NO ESTABA EN EJECUCION" -ForegroundColor Yellow
    Write-Host "  ============================================================" -ForegroundColor Yellow
}
Write-Host "   Tus datos siguen guardados en la base de datos." -ForegroundColor White
Write-Host "   Para volver a usarla: Iniciar GamificApp.cmd" -ForegroundColor White

if ($ajenos.Count -gt 0) {
    Write-Host ''
    Write-Host "   Aviso: estos puertos siguen ocupados por programas que" -ForegroundColor Yellow
    Write-Host "   GamificApp NO inicio, asi que no se han cerrado:" -ForegroundColor Yellow
    foreach ($ajeno in $ajenos) {
        Write-Host "     Puerto $($ajeno.Puerto): $($ajeno.Dueno.Nombre) (PID $($ajeno.Dueno.ProcesoId))" -ForegroundColor Yellow
        Escribir-Log "Puerto $($ajeno.Puerto) ocupado por proceso ajeno: $($ajeno.Dueno.Nombre) PID $($ajeno.Dueno.ProcesoId)" 'AVISO' $false
    }
    Write-Host "   Cierralos tu mismo si quieres liberar esos puertos." -ForegroundColor Yellow
}
Write-Host ''
Escribir-Log "Detencion completada. Servicios detenidos: $detenidos" 'OK' $false
exit 0
