/* @flow weak */

import Helmet from 'react-helmet';
import IsomorphicRouter from 'isomorphic-relay-router';
import log from '../server/log.js';
import path from 'path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import Relay from 'react-relay';
import RelayLocalSchema from 'relay-local-schema';
import { match, Router } from 'react-router';

import { getUserByCookie, serveAuthenticationFailed } from '../server/credentials_check.js';
import isomorphicVars from './scripts/isomorphicVars';
import ObjectManager from '../data/ObjectManager';
import routes from './routes';
import schema from '../graphql/schema'; // Schema for GraphQL server

// Read environment
require( 'dotenv' ).load( );

// Load up isomorphic vars here, for server rendering
const isoVars = JSON.stringify( isomorphicVars( ) );

export function serveFailure( type, res, message, err )
{
  log.log( type, 'Server error: ' + message, err );

  res.status( 500 ).send( 'Server error' );
}

export default ( req, res, next, assetsPath ) =>
{
  match( { routes, location: req.originalUrl }, ( error, redirectLocation, renderProps ) => {
    if( error )
      next(error);
    else if( redirectLocation )
      res.redirect( 302, redirectLocation.pathname + redirectLocation.search );
    else if( renderProps )
      reunderOnServerCorrectRequest( req, res, next, assetsPath, renderProps );
    else
        res.status( 404 ).send( 'Not Found' );
  } );
};

function reunderOnServerCorrectRequest( req, res, next, assetsPath, renderProps )
{
  // create individual object manager for each request
  const objectManager = new ObjectManager( );

  getUserByCookie( objectManager, req, res )
  .then( ( a_User ) => {
    try
    {
      const user_id = a_User.id;

      const networkLayer = new RelayLocalSchema.NetworkLayer( {
        schema,
        rootValue: objectManager,
        onError: ( errors, request ) => serveFailure( 'error', res, 'local network layer GraphQL failure', { errors, request } )
      } );

      function render( { data, props } )
      {
        try
        {
          // Setting up static, global navigator object to pass user agent to material-ui. Previously
          // this was protected by the queue but is this legal now? Consult with new MUI
          // documentation.
          GLOBAL.navigator = { userAgent: req.headers[ 'user-agent' ] };

          // Setting up static, global location for the leftNav
          GLOBAL.location = { pathname: req.originalUrl };

          const reactOutput = ReactDOMServer.renderToString( <Router {...props} /> );
          const helmet = Helmet.rewind( );

          res.render( path.resolve( __dirname, 'renderOnServer.ejs' ), {
              preloadedData: JSON.stringify(data),
              assetsPath: assetsPath,
              reactOutput,
              title: helmet.title,
              meta: helmet.meta,
              link: helmet.link,
              isomorphicVars: isoVars,
              NODE_ENV: process.env.NODE_ENV,
          } );
        }
        catch( err )
        {
          serveFailure( 'error', res, 'renderOnServer render funcion failed', err )
        }
      }

      IsomorphicRouter.prepareData( renderProps, networkLayer ).then( render, next );
    }
    catch( err )
    {
      serveFailure( 'error', res, 'renderOnServer failed', err )
    }
  } )
  .catch( ( error ) => serveAuthenticationFailed( res, error ) )
  ; // then
}
