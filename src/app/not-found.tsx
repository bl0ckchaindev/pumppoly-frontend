/* eslint-disable no-unused-vars */
/* eslint-disable no-mixed-operators */
/* eslint-disable no-undef */
/* eslint-disable jsx-a11y/alt-text */
import React from 'react'
import Footer from '../components/common/Footer'
import TopBar from '../components/common/TopBar'
import Link from 'next/link'

const App = () => {
  return (
    <div>
      <div className="GlobalContainer">
        <div style={{ zIndex: 1 }}>
          <TopBar />
          <div className="navBar">
          </div>
          <div className="headerMargin" />
          <div className="MainDashboard" style={{ height: '40vh' }}>
            <>
              <section>
                <section>
                  <p className="ContractContentTextTitle h1">
                    The Base Network&apos;s PumpPoly
                  </p>
                  <p style={{ textAlign: 'center' }}>
                    <Link href="/create" className="create-token-button">
                      Create&nbsp;Token&nbsp;Launch
                    </Link>
                  </p>
                  <br />
                </section>
              </section>
            </>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default function NotFound() {
  return <App />
}
